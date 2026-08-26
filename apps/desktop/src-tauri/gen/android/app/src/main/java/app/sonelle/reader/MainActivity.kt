package app.sonelle.reader

import android.os.Bundle
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    fitSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) fitSystemBars()
  }

  private fun fitSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(window, true)
  }
}
