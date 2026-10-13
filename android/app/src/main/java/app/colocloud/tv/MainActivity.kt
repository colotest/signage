package app.colocloud.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.annotation.RequiresApi
import org.json.JSONArray

// The player: the screen's own page (/screen/{id}) in a transparent
// WebView, with VideoLayer underneath it playing whatever video the page
// hands over. So everything the page does — live playlist changes, timed
// playback, the dashboard's remote controls and preview — works here
// exactly as in a browser, and changes with every deploy without a new APK.
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var root: FrameLayout
    private lateinit var video: VideoLayer
    private var web: WebView? = null
    private var url = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.applyIntent(this, intent)
        val playerUrl = Prefs.playerUrl(this)
        if (playerUrl == null) {
            openSetup()
            finish()
            return
        }
        url = playerUrl

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        video = VideoLayer(this) { handle, event ->
            web?.evaluateJavascript("window.__signageNative && window.__signageNative($handle, '$event')", null)
        }
        root.addView(video, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        setContentView(root)
        WebView.setWebContentsDebuggingEnabled(true) // chrome://inspect over adb
        createWebView()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (Prefs.applyIntent(this, intent)) recreate()
    }

    @Suppress("DEPRECATION")
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
        }
    }

    // Sent to the home screen: stop decoding for nobody. Coming back starts
    // the page afresh, which picks up wherever the playlist is now.
    override fun onStop() {
        super.onStop()
        web?.onPause()
        if (::video.isInitialized) video.stop()
    }

    override fun onRestart() {
        super.onRestart()
        web?.onResume()
        web?.loadUrl(url)
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        web?.destroy()
        if (::video.isInitialized) video.release()
        super.onDestroy()
    }

    // ☰ on the remote opens the setup screen. Back does nothing, so a
    // stray press can't leave the player; Home still does.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_MENU -> {
                if (event.action == KeyEvent.ACTION_UP) openSetup()
                return true
            }
            KeyEvent.KEYCODE_BACK -> return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun openSetup() {
        startActivity(Intent(this, SetupActivity::class.java))
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        val view = WebView(this)
        view.setBackgroundColor(Color.TRANSPARENT)
        view.isFocusable = false
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        view.addJavascriptInterface(Bridge(), "SignageNative")
        view.webViewClient = Client()
        view.webChromeClient = object : WebChromeClient() {
            // Otherwise a grey play-button poster, should the page ever
            // show a <video> of its own.
            override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
        }
        root.addView(view, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
        web = view
        view.loadUrl(url)
    }

    private val reload = Runnable { web?.loadUrl(url) }

    private inner class Client : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            // A reload (the dashboard's, or ours) starts the page over, so
            // nothing it was playing should outlive it.
            video.stop()
        }

        // The page itself didn't load — no network, and the page's service
        // worker had no copy yet. Show black rather than the browser's error
        // page, and keep trying.
        @Deprecated("Still the one called for the main frame on every API level")
        override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
            view.loadDataWithBaseURL(null, "<html style=\"background:#000\"></html>", "text/html", "utf-8", null)
            main.removeCallbacks(reload)
            main.postDelayed(reload, 15_000)
        }

        // The page's renderer crashed or was killed for memory. Without
        // this the whole app would go down with it.
        @RequiresApi(26)
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            root.removeView(view)
            view.destroy()
            if (web === view) web = null
            video.stop()
            main.post { createWebView() }
            return true
        }
    }

    // window.SignageNative. Called on the WebView's own thread, so every
    // call is posted to the main one, in order.
    private inner class Bridge {
        @JavascriptInterface
        fun play(handle: Int, url: String, paused: Boolean, loop: Boolean, fit: String, rotation: Int) {
            main.post { video.play(handle, url, paused, loop, fit, rotation) }
        }

        @JavascriptInterface
        fun setPaused(handle: Int, paused: Boolean) {
            main.post { video.setPaused(handle, paused) }
        }

        @JavascriptInterface
        fun setLoop(handle: Int, loop: Boolean) {
            main.post { video.setLoop(handle, loop) }
        }

        @JavascriptInterface
        fun setLayout(fit: String, rotation: Int) {
            main.post { video.setLayout(fit, rotation) }
        }

        @JavascriptInterface
        fun stop() {
            main.post { video.stop() }
        }

        @JavascriptInterface
        fun positionMs(): Long = video.positionMs

        @JavascriptInterface
        fun setBackground(color: String) {
            val parsed = try {
                Color.parseColor(color)
            } catch (_: IllegalArgumentException) {
                return
            }
            main.post {
                video.setBackground(parsed)
                root.setBackgroundColor(parsed)
            }
        }

        @JavascriptInterface
        fun preload(url: String) {
            MediaStore.preload(url)
        }

        @JavascriptInterface
        fun retain(urlsJson: String) {
            val keep = try {
                val array = JSONArray(urlsJson)
                (0 until array.length()).map { array.getString(it) }.toSet()
            } catch (_: Exception) {
                return
            }
            MediaStore.retain(keep)
        }
    }
}
