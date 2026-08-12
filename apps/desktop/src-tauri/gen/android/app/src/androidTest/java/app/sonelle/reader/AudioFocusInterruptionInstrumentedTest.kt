package app.sonelle.reader

import android.media.AudioManager
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AudioFocusInterruptionInstrumentedTest {
  @Test
  fun transientDuckingPermanentLossAndReturnRemainIdempotent() {
    val policy = AudioFocusInterruptionPolicy()

    assertEquals(
      listOf(FocusIntent("interruption-started")),
      policy.accept(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)
    )
    assertEquals(emptyList<FocusIntent>(), policy.accept(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT))
    assertEquals(
      listOf(FocusIntent("interruption-ended", true)),
      policy.accept(AudioManager.AUDIOFOCUS_GAIN)
    )
    assertEquals(emptyList<FocusIntent>(), policy.accept(AudioManager.AUDIOFOCUS_GAIN))
    assertEquals(
      listOf(FocusIntent("interruption-started"), FocusIntent("interruption-ended", false)),
      policy.accept(AudioManager.AUDIOFOCUS_LOSS)
    )
  }
}
