package com.jake750.waraq

import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Dark system bars with light icons, matching the app's default dark theme.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)

    // Older WebViews don't expose safe-area insets to CSS, so keep the page
    // out from under the status/navigation bars natively.
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.parseColor("#0f1320"))
    ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      // The keyboard too: edge-to-edge windows no longer resize for it, so the search box would hide behind it.
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      // Consumed: a newer WebView must not add env(safe-area-inset-*) padding on top of this.
      WindowInsetsCompat.CONSUMED
    }
  }
}
