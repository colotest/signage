@file:OptIn(UnstableApi::class)

package app.colocloud.tv

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

// Plays the page's videos (see nativeVideo.ts on the web side), underneath
// the transparent WebView. The stick's hardware decoder renders straight to
// a SurfaceView, which the display composites on its own — no browser and
// no GPU copy in between, which is what makes this smooth where a <video>
// in the stick's browser isn't. A rotated screen needs a TextureView
// instead, since a SurfaceView can't be rotated; that costs one GPU pass,
// still far less than the browser's path.
//
// Everything here runs on the main thread; Bridge posts calls onto it.
class VideoLayer(context: Context, private val emit: (handle: Int, event: String) -> Unit) : FrameLayout(context) {
    private val main = Handler(Looper.getMainLooper())
    private val player: ExoPlayer
    private val stage = RotatedFrame(context)
    private val frame = FitFrame(context)
    private var surface: View? = null

    // The screen's background, over the video until its first frame is
    // drawn, and whenever there's no video at all.
    private val shutter = View(context)

    // The page's handle for the video playing now; 0 for none.
    private var handle = 0

    // Read by the page on its own thread (Bridge.positionMs).
    @Volatile
    var positionMs = 0L
        private set

    private val tick = object : Runnable {
        override fun run() {
            if (handle == 0) return
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
        if (handle == 0) return@Runnable
        if (failures >= 3 && player.repeatMode == Player.REPEAT_MODE_OFF) {
            emit(handle, "ended")
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
                    frame.setAspect(videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height)
                }
            }

            override fun onRenderedFirstFrame() {
                shutter.visibility = View.GONE
                failures = 0
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                positionMs = player.currentPosition
                emit(handle, "change")
            }

            override fun onPositionDiscontinuity(
                oldPosition: Player.PositionInfo,
                newPosition: Player.PositionInfo,
                reason: Int,
            ) {
                positionMs = player.currentPosition
                emit(handle, "change")
            }

            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) emit(handle, "ended")
            }

            override fun onPlayerError(error: PlaybackException) {
                failures++
                main.removeCallbacks(retry)
                main.postDelayed(retry, 3000)
            }
        })

        setBackgroundColor(Color.BLACK)
        shutter.setBackgroundColor(Color.BLACK)
        stage.addView(frame, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(stage, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(shutter, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        setLayout("contain", 0)
    }

    fun play(handle: Int, url: String, paused: Boolean, loop: Boolean, fit: String, rotation: Int) {
        this.handle = handle
        failures = 0
        main.removeCallbacks(retry)
        setLayout(fit, rotation)
        shutter.visibility = View.VISIBLE
        positionMs = 0
        player.setMediaItem(MediaItem.fromUri(url))
        player.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        player.playWhenReady = !paused
        player.prepare()
        main.removeCallbacks(tick)
        main.post(tick)
    }

    fun setPaused(handle: Int, paused: Boolean) {
        if (handle == this.handle) player.playWhenReady = !paused
    }

    fun setLoop(handle: Int, loop: Boolean) {
        if (handle == this.handle) player.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
    }

    fun stop() {
        handle = 0
        positionMs = 0
        main.removeCallbacks(retry)
        main.removeCallbacks(tick)
        player.stop()
        player.clearMediaItems()
        shutter.visibility = View.VISIBLE
    }

    fun setLayout(fit: String, rotation: Int) {
        val degrees = if (rotation == 90 || rotation == 180 || rotation == 270) rotation else 0
        val wantsTexture = degrees != 0
        if (surface == null || (surface is TextureView) != wantsTexture) {
            surface?.let { frame.removeView(it) }
            val view = if (wantsTexture) TextureView(context) else SurfaceView(context)
            frame.addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
            if (view is TextureView) player.setVideoTextureView(view) else player.setVideoSurfaceView(view as SurfaceView)
            surface = view
        }
        frame.setCover(fit == "cover")
        stage.setDegrees(degrees)
    }

    fun setBackground(color: Int) {
        setBackgroundColor(color)
        shutter.setBackgroundColor(color)
    }

    fun release() {
        main.removeCallbacksAndMessages(null)
        player.release()
    }
}

// Lays its one child out at the screen's size — swapped for a quarter turn —
// and turns it by the screen's rotation, the same as the page's rotation
// wrapper does to everything else (Player.tsx, rotationWrapperStyle).
private class RotatedFrame(context: Context) : FrameLayout(context) {
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
private class FitFrame(context: Context) : FrameLayout(context) {
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
