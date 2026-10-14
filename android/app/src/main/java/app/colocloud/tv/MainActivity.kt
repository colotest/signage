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
// WebView, with Stage underneath it drawing the images and videos the page
// hands over. The page still decides what's on screen and when — live
// playlist changes, timed playback, the dashboard's remote controls and
// preview — exactly as in a browser, so all of that changes with every
// deploy without a new APK.
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var root: FrameLayout
    private lateinit var stage: Stage
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
        stage = Stage(this) { handle, event ->
            web?.evaluateJavascript("window.__signageNative && window.__signageNative($handle, '$event')", null)
        }
        root.addView(stage, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT))
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
        if (::stage.isInitialized) stage.clear()
    }

    override fun onRestart() {
        super.onRestart()
        web?.onResume()
        web?.loadUrl(url)
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        web?.destroy()
        if (::stage.isInitialized) stage.release()
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
            stage.clear()
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
            stage.clear()
            main.post { createWebView() }
            return true
        }
    }

    // window.SignageNative (nativeMedia.ts). Called on the WebView's own
    // thread, so every call is posted to the main one, in order.
    private inner class Bridge {
        @JavascriptInterface
        fun show(handle: Int, slide: String) {
            val spec = SlideSpec.parse(slide) ?: return
            main.post { stage.show(handle, spec) }
        }

        @JavascriptInterface
        fun setPaused(handle: Int, paused: Boolean) {
            main.post { stage.setPaused(handle, paused) }
        }

        @JavascriptInterface
        fun setLoop(handle: Int, loop: Boolean) {
            main.post { stage.setLoop(handle, loop) }
        }

        @JavascriptInterface
        fun setLayout(fit: String, rotation: Int) {
            main.post { stage.setLayout(fit, rotation) }
        }

        @JavascriptInterface
        fun positionMs(): Long = stage.positionMs

        @JavascriptInterface
        fun setBackground(color: String) {
            val parsed = try {
                Color.parseColor(color)
            } catch (_: IllegalArgumentException) {
                return
            }
            main.post {
                stage.setBackground(parsed)
                root.setBackgroundColor(parsed)
            }
        }

        @JavascriptInterface
        fun preload(url: String) {
            MediaStore.preload(url)
        }

        @JavascriptInterface
        fun prepare(url: String) {
            main.post { Images.prepare(url) }
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
