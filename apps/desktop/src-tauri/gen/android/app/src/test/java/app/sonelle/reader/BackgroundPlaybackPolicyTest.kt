package app.sonelle.reader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackgroundPlaybackPolicyTest {
  @Test
  fun `playing starts once and later snapshots update the active service`() {
    val policy = BackgroundPlaybackPolicy()

    assertEquals(BackgroundServiceCommand.START, policy.accept("playing"))
    assertEquals(BackgroundServiceCommand.UPDATE, policy.accept("playing"))
    assertEquals(BackgroundServiceCommand.UPDATE, policy.accept("paused"))
    assertTrue(policy.serviceActive)
  }

  @Test
  fun `ended playback stops the service and idle updates stay inert`() {
    val policy = BackgroundPlaybackPolicy()

    assertEquals(BackgroundServiceCommand.IGNORE, policy.accept("paused"))
    assertEquals(BackgroundServiceCommand.START, policy.accept("playing"))
    assertEquals(BackgroundServiceCommand.STOP, policy.accept("ended"))
    assertEquals(BackgroundServiceCommand.IGNORE, policy.accept("idle"))
    assertFalse(policy.serviceActive)
  }

  @Test
  fun `notification stop prevents the projected pause from restarting the service`() {
    val policy = BackgroundPlaybackPolicy()

    policy.accept("playing")
    policy.stoppedExternally()

    assertEquals(BackgroundServiceCommand.IGNORE, policy.accept("paused"))
    assertFalse(policy.serviceActive)
  }
}
