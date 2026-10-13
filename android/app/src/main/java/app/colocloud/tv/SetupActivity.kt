package app.colocloud.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

// Which screen this stick shows: its number from the dashboard (the tile's
// /screen/{id}), and the server, which only needs changing for a test
// deployment. Opened on first launch, and by ☰ on the remote from then on.
class SetupActivity : Activity() {
    private lateinit var screen: EditText
    private lateinit var server: EditText
    private lateinit var message: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(48), dp(32), dp(48), dp(32))
        }

        column.addView(text("Colo Cloud", 32f).apply { setTypeface(typeface, Typeface.BOLD) })
        column.addView(text("Screen number — the one in the screen's /screen/… address on the dashboard.", 16f).apply {
            setTextColor(Color.LTGRAY)
            setPadding(0, dp(16), 0, dp(8))
        })
        screen = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            setText(Prefs.screenId(this@SetupActivity) ?: "")
            setTextColor(Color.WHITE)
            setSingleLine()
        }
        column.addView(screen, LinearLayout.LayoutParams(dp(320), WRAP_CONTENT))

        column.addView(text("Server", 16f).apply {
            setTextColor(Color.LTGRAY)
            setPadding(0, dp(16), 0, dp(8))
        })
        server = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText(Prefs.server(this@SetupActivity))
            setTextColor(Color.WHITE)
            setSingleLine()
        }
        column.addView(server, LinearLayout.LayoutParams(dp(320), WRAP_CONTENT))

        message = text("", 16f).apply {
            setTextColor(Color.rgb(255, 120, 120))
            setPadding(0, dp(12), 0, 0)
        }
        column.addView(message)

        val start = Button(this).apply {
            text = "Start"
            setOnClickListener { start() }
        }
        column.addView(start, LinearLayout.LayoutParams(dp(320), WRAP_CONTENT).apply { topMargin = dp(16) })

        // Android 10+ (Fire OS 8) only lets the app open itself after a
        // power cut with "display over other apps" allowed.
        if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(this)) {
            val allow = Button(this).apply {
                text = "Allow starting on power-up"
                setOnClickListener { openOverlaySettings() }
            }
            column.addView(allow, LinearLayout.LayoutParams(dp(320), WRAP_CONTENT).apply { topMargin = dp(8) })
        }

        column.addView(text("Press ☰ on the remote any time to come back here.", 14f).apply {
            setTextColor(Color.GRAY)
            setPadding(0, dp(24), 0, 0)
        })

        setContentView(column)
        (if (screen.text.isEmpty()) screen else start).requestFocus()
    }

    private fun start() {
        val id = screen.text.toString().trim()
        val url = server.text.toString().trim()
        if (id.isEmpty() || id.toLongOrNull() == null) {
            message.text = "Enter the screen's number."
            return
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            message.text = "The server must start with https://"
            return
        }
        Prefs.save(this, url, id)
        startActivity(
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
    }

    private fun openOverlaySettings() {
        try {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        } catch (_: Exception) {
            message.text = "This stick has no setting for it. Over adb instead: " +
                "adb shell appops set $packageName SYSTEM_ALERT_WINDOW allow"
        }
    }

    private fun text(value: String, sp: Float) = TextView(this).apply {
        text = value
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
        gravity = Gravity.CENTER_HORIZONTAL
    }

    private fun dp(value: Int) = Math.round(value * resources.displayMetrics.density)
}
