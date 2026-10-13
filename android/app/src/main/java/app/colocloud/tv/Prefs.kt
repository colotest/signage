package app.colocloud.tv

import android.content.Context
import android.content.Intent

// Which screen this stick is, and which deployment it loads it from.
object Prefs {
    const val DEFAULT_SERVER = "https://colo-cloud.app"

    private fun prefs(context: Context) = context.getSharedPreferences("player", Context.MODE_PRIVATE)

    fun server(context: Context): String = prefs(context).getString("server", null) ?: DEFAULT_SERVER

    fun screenId(context: Context): String? = prefs(context).getString("screen", null)

    fun save(context: Context, server: String, screenId: String) {
        prefs(context).edit().putString("server", server.trim().trimEnd('/')).putString("screen", screenId.trim()).apply()
    }

    // ?app=1 tells the page it's in here, so it hands videos to VideoLayer.
    fun playerUrl(context: Context): String? =
        screenId(context)?.let { "${server(context)}/screen/$it?app=1" }

    // Also settable over adb, for setting up a stick without the remote:
    //   adb shell am start -n app.colocloud.tv/.MainActivity --es screen 3
    // Returns whether anything changed.
    fun applyIntent(context: Context, intent: Intent?): Boolean {
        val screen = intent?.getStringExtra("screen")?.takeIf { it.isNotBlank() } ?: return false
        val server = intent.getStringExtra("server")?.takeIf { it.isNotBlank() } ?: server(context)
        if (screen == screenId(context) && server.trimEnd('/') == server(context)) return false
        save(context, server, screen)
        return true
    }
}
