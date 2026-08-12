package app.sonelle.reader

import android.media.AudioManager
import org.junit.Assert.assertEquals
import org.junit.Test

class AudioFocusInterruptionPolicyTest {
  @Test
  fun `transient loss and ducking pause once then permit one resume`() {
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
  }

  @Test
  fun `permanent loss clears pending resume`() {
    val policy = AudioFocusInterruptionPolicy()
    policy.accept(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)

    assertEquals(
      listOf(FocusIntent("interruption-ended", false)),
      policy.accept(AudioManager.AUDIOFOCUS_LOSS)
    )
    assertEquals(emptyList<FocusIntent>(), policy.accept(AudioManager.AUDIOFOCUS_GAIN))
  }
}
