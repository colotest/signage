package app.colocloud.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Opens the player when the stick powers up, so a power cut fixes itself.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (Prefs.screenId(context) == null) return
        try {
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            // Refused (Android 10+ without the overlay permission) — opening
            // it from the home screen still works.
        }
    }
}
