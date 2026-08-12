package app.sonelle.reader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LockScreenControlPolicyTest {
  @Test
  fun `repeated play and pause callbacks are idempotent`() {
    val policy = LockScreenControlPolicy()

    assertEquals("play", policy.accept("play").emit)
    assertNull(policy.accept("play").emit)
    assertTrue(policy.playing)

    assertEquals("pause", policy.accept("pause").emit)
    assertNull(policy.accept("pause").emit)
    assertFalse(policy.playing)
  }

  @Test
  fun `previous and next remain sentence navigation intents`() {
    val policy = LockScreenControlPolicy(initiallyPlaying = true)

    assertEquals("previous", policy.accept("previous").emit)
    assertEquals("next", policy.accept("next").emit)
    assertTrue(policy.playing)
  }

  @Test
  fun `stop is explicit and leaves playback paused`() {
    val policy = LockScreenControlPolicy(initiallyPlaying = true)

    val decision = policy.accept("stop")

    assertEquals("stop", decision.emit)
    assertTrue(decision.stop)
    assertFalse(decision.playing)
  }
}

class OutputDisconnectPolicyTest {
  @Test
  fun `rapid disconnect callbacks emit once until playback starts again`() {
    val policy = OutputDisconnectPolicy()

    assertFalse(policy.disconnect())
    policy.project(playing = true)
    assertTrue(policy.disconnect())
    assertFalse(policy.disconnect())
    policy.project(playing = false)
    assertFalse(policy.disconnect())
    policy.project(playing = true)
    assertTrue(policy.disconnect())
  }
}
