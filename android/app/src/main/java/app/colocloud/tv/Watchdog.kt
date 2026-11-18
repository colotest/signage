package app.colocloud.tv

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.util.Log
import kotlin.system.exitProcess

// Reopens the player should the app crash. While the player is on screen,
// an alarm checks on it every minute. The alarm lives in the system, not in
// the app, so it still goes off once the app's process has died, and the
// fresh process it starts finds no player running and opens one. Leaving
// the player on purpose (Home, or ☰ for setup) cancels it, so the stick is
// never pulled back from wherever it was sent.
//
// Like BootReceiver, opening the player from here needs the overlay
// permission on Android 10+ (Fire OS 8).
class Watchdog : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (running) return
        try {
            context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            // Refused: no overlay permission. The next check tries again.
        }
    }

    companion object {
        private const val CHECK_EVERY_MS = 60_000L
        private const val AFTER_CRASH_MS = 3_000L

        // Whether this process has the player on screen (started, not yet
        // stopped). A process the alarm had to start afresh never does.
        @Volatile
        var running = false

        private var crashHandlerInstalled = false

        fun start(context: Context) {
            running = true
            val first = SystemClock.elapsedRealtime() + CHECK_EVERY_MS
            alarms(context).setRepeating(AlarmManager.ELAPSED_REALTIME, first, CHECK_EVERY_MS, check(context, 0))
        }

        fun stop(context: Context) {
            running = false
            alarms(context).cancel(check(context, 0))
        }

        // A crash while the player is up: come back in a few seconds rather
        // than at the next check, and without the system's "has stopped"
        // dialog, which would otherwise sit over the reopened player until
        // someone dismissed it with the remote.
        fun installCrashHandler(context: Context) {
            if (crashHandlerInstalled) return
            crashHandlerInstalled = true
            val app = context.applicationContext
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, error ->
                if (!running) {
                    previous?.uncaughtException(thread, error)
                    return@setDefaultUncaughtExceptionHandler
                }
                Log.e("Watchdog", "Crashed, reopening", error)
                try {
                    alarms(app).set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + AFTER_CRASH_MS, check(app, 1))
                } catch (_: Exception) {
                    // The every-minute check still reopens it.
                }
                Process.killProcess(Process.myPid())
                exitProcess(10)
            }
        }

        private fun alarms(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        private fun check(context: Context, requestCode: Int): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                requestCode,
                Intent(context, Watchdog::class.java),
                if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0,
            )
    }
}
