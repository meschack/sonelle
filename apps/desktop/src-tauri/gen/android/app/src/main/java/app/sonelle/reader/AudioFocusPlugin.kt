package app.sonelle.reader

import android.app.Activity
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class AudioFocusSubscriptionArgs {
  lateinit var onIntent: Channel
}

@InvokeArg
class AudioFocusPlaybackArgs {
  var playing: Boolean = false
}

internal data class FocusIntent(val type: String, val mayResume: Boolean? = null)

internal class AudioFocusInterruptionPolicy {
  var interrupted = false
    private set

  fun accept(change: Int): List<FocusIntent> = when (change) {
    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
      if (interrupted) emptyList()
      else {
        interrupted = true
        listOf(FocusIntent("interruption-started"))
      }
    }
    AudioManager.AUDIOFOCUS_GAIN -> {
      if (!interrupted) emptyList()
      else {
        interrupted = false
        listOf(FocusIntent("interruption-ended", true))
      }
    }
    AudioManager.AUDIOFOCUS_LOSS -> {
      val started = if (interrupted) emptyList() else listOf(FocusIntent("interruption-started"))
      interrupted = false
      started + FocusIntent("interruption-ended", false)
    }
    else -> emptyList()
  }

  fun reset() {
    interrupted = false
  }
}

@TauriPlugin
class AudioFocusPlugin(private val activity: Activity) : Plugin(activity) {
  private val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val policy = AudioFocusInterruptionPolicy()
  private var intentChannel: Channel? = null
  private var focusHeld = false
  private val focusListener = AudioManager.OnAudioFocusChangeListener(::handleFocusChange)
  private val focusRequest: AudioFocusRequest? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setOnAudioFocusChangeListener(focusListener)
      .setWillPauseWhenDucked(true)
      .build()
  } else null

  override fun load(webView: WebView) = Unit

  @Command
  fun subscribe(invoke: Invoke) {
    intentChannel = invoke.parseArgs(AudioFocusSubscriptionArgs::class.java).onIntent
    invoke.resolve(JSObject())
  }

  @Command
  fun setPlayback(invoke: Invoke) {
    val playing = invoke.parseArgs(AudioFocusPlaybackArgs::class.java).playing
    if (playing) requestFocus() else if (!policy.interrupted) abandonFocus()
    invoke.resolve(JSObject())
  }

  @Command
  fun clear(invoke: Invoke) {
    abandonFocus()
    policy.reset()
    invoke.resolve(JSObject())
  }

  override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
    abandonFocus()
    intentChannel = null
  }

  private fun requestFocus() {
    if (focusHeld) return
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioManager.requestAudioFocus(focusRequest!!)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        focusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN
      )
    }
    focusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (!focusHeld) emit(policy.accept(AudioManager.AUDIOFOCUS_LOSS))
  }

  private fun abandonFocus() {
    if (!focusHeld) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioManager.abandonAudioFocusRequest(focusRequest!!)
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(focusListener)
    }
    focusHeld = false
  }

  private fun handleFocusChange(change: Int) {
    if (change == AudioManager.AUDIOFOCUS_LOSS) focusHeld = false
    emit(policy.accept(change))
  }

  private fun emit(intents: List<FocusIntent>) {
    intents.forEach { intent ->
      intentChannel?.send(JSObject().apply {
        put("type", intent.type)
        intent.mayResume?.let { put("mayResume", it) }
      })
    }
  }
}
