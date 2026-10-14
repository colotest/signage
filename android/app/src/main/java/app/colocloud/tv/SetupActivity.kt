package app.colocloud.tv

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.NumberPicker

// Which screen this stick shows: just its number from the dashboard (the
// tile's /screen/{id}), picked with up and down on the remote and started
// with OK. Opened on first launch, and by ☰ on the remote from then on.
// The server is fixed (Prefs.DEFAULT_SERVER; adb can still override it).
class SetupActivity : Activity() {
    private lateinit var picker: NumberPicker

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        picker = NumberPicker(this).apply {
            minValue = 1
            maxValue = MAX_SCREEN
            value = Prefs.screenId(this@SetupActivity)?.toIntOrNull()?.coerceIn(1, MAX_SCREEN) ?: 1
            wrapSelectorWheel = true
            // Up and down only: no keyboard popping up for typing a number.
            descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
            isFocusable = true
            scaleX = 2.5f
            scaleY = 2.5f
        }
        val root = FrameLayout(this)
        root.addView(
            picker,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER,
            ),
        )
        setContentView(root)
        picker.requestFocus()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> {
                if (event.action == KeyEvent.ACTION_UP) start()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun start() {
        Prefs.save(this, Prefs.server(this), picker.value.toString())
        startActivity(
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
    }

    companion object {
        private const val MAX_SCREEN = 999
    }
}
