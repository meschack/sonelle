package app.sonelle.reader

import android.content.ComponentName
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class BackgroundPlaybackManifestInstrumentedTest {
  @Test
  fun foregroundPlaybackServiceIsPrivateAndDeclaresItsType() {
    val context = ApplicationProvider.getApplicationContext<android.content.Context>()
    @Suppress("DEPRECATION")
    val service = context.packageManager.getServiceInfo(
      ComponentName(context, NarrationPlaybackService::class.java),
      0
    )

    assertFalse(service.exported)
    assertEquals(
      android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
      service.foregroundServiceType
    )
  }
}
