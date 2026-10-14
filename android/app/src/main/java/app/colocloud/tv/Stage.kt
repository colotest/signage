@file:OptIn(UnstableApi::class)

package app.colocloud.tv

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import org.json.JSONObject

// What the page wants on screen next — nativeMedia.ts's NativeSlide.
data class SlideSpec(
    val kind: String,
    val url: String?,
    val transition: String,
    val direction: String,
    val durationMs: Long,
    val paused: Boolean,
    val loop: Boolean,
) {
    companion object {
        fun parse(json: String): SlideSpec? = try {
            val o = JSONObject(json)
            SlideSpec(
                kind = o.optString("kind", "none"),
                url = if (o.isNull("url")) null else o.getString("url"),
                transition = o.optString("transition", "cut"),
                direction = o.optString("direction", "right"),
                durationMs = o.optLong("durationMs", 400),
                paused = o.optBoolean("paused", false),
                loop = o.optBoolean("loop", false),
            )
        } catch (_: Exception) {
            null
        }
    }
}

// Draws the page's images and videos (see nativeMedia.ts on the web side),
// underneath the transparent WebView, and runs the transitions between
// them: the same cut, dip, crossfade and slide as the page's CSS ones, at
// the same speeds and curves, so a transition between one of these and a
// slide the page draws itself (the clock, say) lines up — each side
// animates its own half.
//
// Video is decoded by the stick's hardware straight onto a SurfaceView,
// which the display composites on its own: no browser and no GPU copy in
// between. A SurfaceView can't be rotated, so a rotated screen uses a
// TextureView instead, which costs one GPU pass. One player, so one
// decoder: the page already turns video-to-video transitions into a dip
// (Player.tsx, effectiveTransition), and this does the same as a backstop,
// switching the player over at the dip's midpoint.
//
// Everything here runs on the main thread; MainActivity's Bridge posts
// calls onto it.
class Stage(context: Context, private val emit: (handle: Int, event: String) -> Unit) : FrameLayout(context) {
    private val main = Handler(Looper.getMainLooper())
    private val rotated = RotatedFrame(context)

    // The slides, in the screen's own orientation: rotated as a whole, so a
    // slide transition moves along the content's axes, as the page's does.
    private val content = FrameLayout(context)

    private var background = Color.BLACK
    private var cover = false
    private var degrees = 0

    // The page's handle for the slide on screen, and that slide; null when
    // the page is showing one of its own.
    private var handle = 0
    private var current: Slide? = null
    private var transition: Transition? = null
    // A transition waiting for its image to finish decoding.
    private var pendingStart: Runnable? = null

    private val player: ExoPlayer
    // Whose video is loaded in the player: the slide, and its page handle.
    private var playerSlide: VideoSlide? = null
    private var playerHandle = 0

    // Read by the page on its own thread (Bridge.positionMs).
    @Volatile
    var positionMs = 0L
        private set

    private val tick = object : Runnable {
        override fun run() {
            if (playerHandle == 0) return
            positionMs = player.currentPosition
            main.postDelayed(this, 250)
        }
    }

    // A failed load or decode (the network dropping mid-download, say) is
    // retried in place rather than reported. Except that a video that keeps
    // failing in a playlist with anything else in it is let go as if it had
    // ended, so one broken file can't hold up everything after it.
    private var failures = 0
    private val retry = Runnable {
        if (playerHandle == 0) return@Runnable
        if (failures >= 3 && player.repeatMode == Player.REPEAT_MODE_OFF) {
            emit(playerHandle, "ended")
        } else {
            player.prepare()
        }
    }

    init {
        MediaStore.init(context)
        val renderers = DefaultRenderersFactory(context).setEnableDecoderFallback(true)
        player = ExoPlayer.Builder(context, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(MediaStore.dataSourceFactory))
            .build()
        player.volume = 0f
        player.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    playerSlide?.setAspect(videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height)
                }
            }

            override fun onRenderedFirstFrame() {
                playerSlide?.firstFrame()
                failures = 0
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                positionMs = player.currentPosition
                emit(playerHandle, "change")
            }

            override fun onPositionDiscontinuity(
                oldPosition: Player.PositionInfo,
                newPosition: Player.PositionInfo,
                reason: Int,
            ) {
                positionMs = player.currentPosition
                emit(playerHandle, "change")
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) emit(playerHandle, "ended")
            }

            override fun onPlayerError(error: PlaybackException) {
                failures++
                main.removeCallbacks(retry)
                main.postDelayed(retry, 3000)
            }
        })

        setBackgroundColor(background)
        rotated.addView(content, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(rotated, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        Images.setScreenSize(w, h)
    }

    fun show(handle: Int, spec: SlideSpec) {
        settle()
        this.handle = handle
        val outgoing = current
        val incoming: Slide? = when {
            spec.url == null -> null
            spec.kind == "image" -> ImageSlide(context)
            spec.kind == "video" -> VideoSlide(context, spec.paused, spec.loop)
            else -> null
        }
        current = incoming

        var kind = if (spec.durationMs <= 0) "cut" else spec.transition
        if (outgoing is VideoSlide && incoming is VideoSlide && kind != "cut") kind = "dip"

        if (incoming != null) {
            incoming.applyLayout(cover, degrees != 0)
            incoming.applyBackground(background)
            incoming.setFade(if (kind == "cut") 1f else 0f)
            // Crossfading to a video, the video goes underneath and the
            // image fades off it — a video can't itself fade over anything.
            val under = kind == "crossfade" && incoming is VideoSlide && outgoing != null
            content.addView(
                incoming,
                if (under) 0 else content.childCount,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )
        }

        // The video starts straight away — under the slide it replaces,
        // where there's one — except after another video, at the midpoint.
        val videoAtMidpoint = incoming is VideoSlide && outgoing is VideoSlide
        if (incoming is VideoSlide && !videoAtMidpoint) startVideo(incoming, handle, spec.url!!)

        val begin = Runnable {
            pendingStart = null
            run(kind, spec, outgoing, incoming) {
                if (incoming is VideoSlide && videoAtMidpoint && current === incoming) {
                    startVideo(incoming, handle, spec.url!!)
                }
            }
        }

        if (incoming is ImageSlide) {
            // Wait for the image, so the transition shows it rather than an
            // empty slide — but not for long: a slow first download shows
            // the background instead, until the image arrives.
            pendingStart = begin
            var started = false
            val startOnce = {
                if (!started && pendingStart === begin) {
                    started = true
                    begin.run()
                }
            }
            main.postDelayed({ startOnce() }, 1500)
            incoming.load(spec.url!!) { startOnce() }
        } else {
            begin.run()
        }
    }

    fun setPaused(handle: Int, paused: Boolean) {
        if (handle != this.handle) return
        (current as? VideoSlide)?.paused = paused
        if (handle == playerHandle) player.playWhenReady = !paused
    }

    fun setLoop(handle: Int, loop: Boolean) {
        if (handle != this.handle) return
        (current as? VideoSlide)?.loop = loop
        if (handle == playerHandle) player.repeatMode = repeatMode(loop)
    }

    fun setLayout(fit: String, rotation: Int) {
        cover = fit == "cover"
        degrees = if (rotation == 90 || rotation == 180 || rotation == 270) rotation else 0
        rotated.setDegrees(degrees)
        for (i in 0 until content.childCount) {
            val slide = content.getChildAt(i) as Slide
            slide.applyLayout(cover, degrees != 0)
            if (slide === playerSlide) slide.attach(player)
        }
    }

    fun setBackground(color: Int) {
        background = color
        setBackgroundColor(color)
        for (i in 0 until content.childCount) (content.getChildAt(i) as Slide).applyBackground(color)
    }

    // Takes everything down — the page is starting over.
    fun clear() {
        settle()
        content.removeAllViews()
        current = null
        handle = 0
        stopVideo()
    }

    fun release() {
        main.removeCallbacksAndMessages(null)
        transition?.cancel()
        player.release()
    }

    private fun startVideo(slide: VideoSlide, handle: Int, url: String) {
        playerSlide = slide
        playerHandle = handle
        failures = 0
        positionMs = 0
        main.removeCallbacks(retry)
        slide.attach(player)
        player.setMediaItem(MediaItem.fromUri(url))
        player.repeatMode = repeatMode(slide.loop)
        player.playWhenReady = !slide.paused
        player.prepare()
        main.removeCallbacks(tick)
        main.post(tick)
    }

    private fun stopVideo() {
        playerSlide = null
        playerHandle = 0
        positionMs = 0
        main.removeCallbacks(retry)
        main.removeCallbacks(tick)
        player.stop()
        player.clearMediaItems()
    }

    private fun repeatMode(loop: Boolean) = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF

    // Brings any transition still running (or still waiting on its image)
    // straight to its end, so the next one starts from a settled screen.
    private fun settle() {
        pendingStart?.let {
            pendingStart = null
            it.run()
        }
        transition?.end()
        transition = null
    }

    private fun run(kind: String, spec: SlideSpec, outgoing: Slide?, incoming: Slide?, midpoint: () -> Unit) {
        var midpointDone = false
        fun finish() {
            if (!midpointDone) {
                midpointDone = true
                midpoint()
            }
            if (outgoing != null) {
                content.removeView(outgoing)
                if (outgoing === playerSlide) stopVideo()
            }
            incoming?.apply {
                setFade(1f)
                translationX = 0f
                translationY = 0f
            }
        }

        if (kind == "cut") {
            finish()
            return
        }

        val (dx, dy) = when (spec.direction) {
            "left" -> -1f to 0f
            "top" -> 0f to -1f
            "bottom" -> 0f to 1f
            else -> 1f to 0f
        }
        val animation = Transition(spec.durationMs, update = { t ->
            when (kind) {
                // Out over the first half, in over the second: only one of
                // them is ever visible.
                "dip" -> {
                    outgoing?.setFade(1f - EASE_IN.getInterpolation(minOf(1f, t * 2)))
                    incoming?.setFade(EASE_OUT.getInterpolation(maxOf(0f, t * 2 - 1)))
                }
                "crossfade" -> when {
                    // The page's slide is fading over or off this one.
                    outgoing == null || incoming == null -> incoming?.setFade(1f)
                    incoming is VideoSlide -> {
                        incoming.setFade(1f)
                        outgoing.setFade(1f - EASE_IN.getInterpolation(t))
                    }
                    else -> incoming.setFade(EASE_OUT.getInterpolation(t))
                }
                "slide" -> {
                    val e = STANDARD.getInterpolation(t)
                    val w = content.width.toFloat()
                    val h = content.height.toFloat()
                    incoming?.apply {
                        setFade(1f)
                        translationX = dx * w * (1 - e)
                        translationY = dy * h * (1 - e)
                    }
                    outgoing?.apply {
                        translationX = -dx * w * e
                        translationY = -dy * h * e
                    }
                }
            }
            if (t >= 0.5f && !midpointDone) {
                midpointDone = true
                midpoint()
            }
        }, done = {
            if (transition?.finished == true) transition = null
            finish()
        })
        transition = animation
        animation.start()
    }

    // A transition's clock: its update called with 0..1 once per display
    // frame, then done. Driven straight off the display's frames rather than
    // a ValueAnimator, which Fire TV's developer options can scale down to
    // nothing (a setting people turn on to make the menus snappier) — that
    // would quietly turn every transition into a cut. Also applies its first
    // frame the moment it starts, so nothing flashes in its final position
    // first.
    private class Transition(
        durationMs: Long,
        private val update: (Float) -> Unit,
        private val done: () -> Unit,
    ) : Choreographer.FrameCallback {
        private val durationNanos = durationMs * 1_000_000
        private val choreographer = Choreographer.getInstance()
        private var startNanos = -1L
        var finished = false
            private set

        fun start() {
            update(0f)
            choreographer.postFrameCallback(this)
        }

        override fun doFrame(frameTimeNanos: Long) {
            if (finished) return
            if (startNanos < 0) startNanos = frameTimeNanos
            val t = ((frameTimeNanos - startNanos).toFloat() / durationNanos).coerceIn(0f, 1f)
            update(t)
            if (t >= 1f) complete() else choreographer.postFrameCallback(this)
        }

        // Straight to the end state, as if it had run its course.
        fun end() {
            if (finished) return
            choreographer.removeFrameCallback(this)
            update(1f)
            complete()
        }

        // Stopped where it is, with nothing more called — for teardown.
        fun cancel() {
            finished = true
            choreographer.removeFrameCallback(this)
        }

        private fun complete() {
            finished = true
            done()
        }
    }

    companion object {
        // The page's ease-in, ease-out and cubic-bezier(0.4, 0, 0.2, 1).
        private val EASE_IN = AccelerateInterpolator()
        private val EASE_OUT = DecelerateInterpolator()
        private val STANDARD = PathInterpolator(0.4f, 0f, 0.2f, 1f)
    }
}

// One slide's worth of the stage, filling it.
abstract class Slide(context: Context) : FrameLayout(context) {
    // 0 is invisible (the background shows), 1 fully shown.
    abstract fun setFade(value: Float)
    abstract fun applyLayout(cover: Boolean, rotated: Boolean)
    open fun applyBackground(color: Int) {}
}

class ImageSlide(context: Context) : Slide(context) {
    private val image = ImageView(context)

    init {
        addView(image, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun load(url: String, onLoaded: () -> Unit) {
        Images.get(url) { bitmap ->
            if (bitmap != null) {
                image.setImageBitmap(bitmap)
            } else {
                // Not there yet (no network on a first download, say): keep
                // trying while this slide is still on screen.
                postDelayed({ if (isAttachedToWindow) load(url) {} }, 5000)
            }
            onLoaded()
        }
    }

    override fun setFade(value: Float) {
        alpha = value
    }

    override fun applyLayout(cover: Boolean, rotated: Boolean) {
        image.scaleType = if (cover) ImageView.ScaleType.CENTER_CROP else ImageView.ScaleType.FIT_CENTER
    }
}

class VideoSlide(context: Context, var paused: Boolean, var loop: Boolean) : Slide(context) {
    private val frame = FitFrame(context)
    private var surface: View? = null

    // The background, over the video until its first frame is drawn.
    private val shutter = View(context)

    // The background again, faded over the video to fade it out: a
    // SurfaceView ignores its own alpha.
    private val veil = View(context)

    init {
        addView(frame, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(shutter, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(veil, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    fun attach(player: ExoPlayer) {
        when (val view = surface) {
            is TextureView -> player.setVideoTextureView(view)
            is SurfaceView -> player.setVideoSurfaceView(view)
        }
    }

    fun setAspect(aspect: Float) = frame.setAspect(aspect)

    fun firstFrame() {
        shutter.visibility = View.GONE
    }

    override fun setFade(value: Float) {
        veil.alpha = 1f - value
        veil.visibility = if (value >= 1f) View.GONE else View.VISIBLE
    }

    override fun applyLayout(cover: Boolean, rotated: Boolean) {
        frame.setCover(cover)
        if (surface == null || (surface is TextureView) != rotated) {
            surface?.let { frame.removeView(it) }
            val view = if (rotated) TextureView(context) else SurfaceView(context)
            frame.addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            surface = view
        }
    }

    override fun applyBackground(color: Int) {
        shutter.setBackgroundColor(color)
        veil.setBackgroundColor(color)
    }
}

// Lays its one child out at the screen's size — swapped for a quarter turn —
// and turns it by the screen's rotation, the same as the page's rotation
// wrapper does to everything else (Player.tsx, rotationWrapperStyle).
class RotatedFrame(context: Context) : FrameLayout(context) {
    private var degrees = 0

    fun setDegrees(value: Int) {
        if (value == degrees) return
        degrees = value
        requestLayout()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        val quarter = degrees == 90 || degrees == 270
        val cw = if (quarter) h else w
        val ch = if (quarter) w else h
        for (i in 0 until childCount) {
            getChildAt(i).measure(
                MeasureSpec.makeMeasureSpec(cw, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(ch, MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            val l = (width - child.measuredWidth) / 2
            val t = (height - child.measuredHeight) / 2
            child.layout(l, t, l + child.measuredWidth, t + child.measuredHeight)
            child.rotation = degrees.toFloat()
        }
    }
}

// Sizes the video surface to the video's own shape: inside the screen
// ("contain", letterboxed) or filling it ("cover", cropped) — the page's
// object-contain/object-cover.
class FitFrame(context: Context) : FrameLayout(context) {
    private var aspect = 0f
    private var cover = false

    fun setAspect(value: Float) {
        if (value == aspect) return
        aspect = value
        requestLayout()
    }

    fun setCover(value: Boolean) {
        if (value == cover) return
        cover = value
        requestLayout()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        var cw = w
        var ch = h
        if (aspect > 0f && w > 0 && h > 0) {
            val wider = w.toFloat() / h > aspect
            if (wider != cover) {
                cw = Math.round(h * aspect)
            } else {
                ch = Math.round(w / aspect)
            }
        }
        for (i in 0 until childCount) {
            getChildAt(i).measure(
                MeasureSpec.makeMeasureSpec(cw, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(ch, MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(w, h)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            val l = (width - child.measuredWidth) / 2
            val t = (height - child.measuredHeight) / 2
            child.layout(l, t, l + child.measuredWidth, t + child.measuredHeight)
        }
    }
}
