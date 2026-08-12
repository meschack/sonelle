package app.sonelle.reader

import android.app.Activity
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

@InvokeArg
class DeviceSpeechArgs {
  lateinit var utteranceId: String
  lateinit var text: String
  lateinit var voiceName: String
  lateinit var locale: String
  var playbackRate: Float = 1.0f
  var volume: Float = 1.0f
}

@TauriPlugin
class DeviceNarrationPlugin(private val activity: Activity) : Plugin(activity) {
  private var speech: TextToSpeech? = null
  private var initialized = false
  private var initializationComplete = false
  private val pending = ConcurrentHashMap<String, Invoke>()
  private val pendingVoiceLists = CopyOnWriteArrayList<Invoke>()

  override fun load(webView: WebView) {
    speech = TextToSpeech(activity) { status ->
      initializationComplete = true
      initialized = status == TextToSpeech.SUCCESS
      if (initialized) {
        installProgressListener()
        pendingVoiceLists.forEach(::resolveVoices)
      } else {
        pendingVoiceLists.forEach { it.reject("Device voices aren't available on this device.") }
      }
      pendingVoiceLists.clear()
    }
  }

  @Command
  fun listVoices(invoke: Invoke) {
    if (!initializationComplete) {
      pendingVoiceLists.add(invoke)
      return
    }
    resolveVoices(invoke)
  }

  private fun resolveVoices(invoke: Invoke) {
    val engine = readyEngine(invoke) ?: return
    val voices = engine.voices
      .orEmpty()
      .filter { voice -> voice.locale != null }
      .sortedWith(compareBy({ it.isNetworkConnectionRequired }, { it.locale.toLanguageTag() }, { it.name }))
      .map { voice ->
        JSObject().apply {
          put("name", voice.name)
          put("label", voice.locale.getDisplayName(voice.locale))
          put("locale", voice.locale.toLanguageTag())
          put("networkRequired", voice.isNetworkConnectionRequired)
        }
      }
    invoke.resolve(JSObject().apply { put("voices", JSArray.from(voices.toTypedArray())) })
  }

  @Command
  fun speak(invoke: Invoke) {
    val engine = readyEngine(invoke) ?: return
    val args = invoke.parseArgs(DeviceSpeechArgs::class.java)
    val voice = engine.voices?.firstOrNull { it.name == args.voiceName }
    if (voice == null) {
      invoke.reject("The selected device voice is no longer available.")
      return
    }

    engine.stop()
    rejectPending("Device narration was replaced by a newer sentence.")
    engine.voice = voice
    engine.setSpeechRate(args.playbackRate.coerceIn(0.5f, 2.0f))
    pending[args.utteranceId] = invoke
    val parameters = Bundle().apply {
      putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, args.volume.coerceIn(0.0f, 1.0f))
    }
    val result = engine.speak(args.text, TextToSpeech.QUEUE_FLUSH, parameters, args.utteranceId)
    if (result == TextToSpeech.ERROR) {
      pending.remove(args.utteranceId)
      invoke.reject("This device voice couldn't start reading.")
    }
  }

  @Command
  fun stop(invoke: Invoke) {
    speech?.stop()
    rejectPending("Device narration stopped.")
    invoke.resolve(JSObject())
  }

  override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
    speech?.stop()
    speech?.shutdown()
    speech = null
    initialized = false
    rejectPending("Device narration stopped.")
    pendingVoiceLists.forEach { it.reject("Device voices are no longer available.") }
    pendingVoiceLists.clear()
  }

  private fun readyEngine(invoke: Invoke): TextToSpeech? {
    val engine = speech
    if (!initialized || engine == null) {
      invoke.reject("Device voices are still becoming available.")
      return null
    }
    return engine
  }

  private fun installProgressListener() {
    speech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String) = Unit

      override fun onDone(utteranceId: String) {
        pending.remove(utteranceId)?.resolve(JSObject().apply { put("status", "completed") })
      }

      @Deprecated("Deprecated in Android")
      override fun onError(utteranceId: String) {
        pending.remove(utteranceId)?.reject("This device voice stopped unexpectedly.")
      }

      override fun onError(utteranceId: String, errorCode: Int) {
        pending.remove(utteranceId)?.reject("This device voice stopped unexpectedly.")
      }

      override fun onStop(utteranceId: String, interrupted: Boolean) {
        pending.remove(utteranceId)?.reject("Device narration stopped.")
      }
    })
  }

  private fun rejectPending(message: String) {
    pending.values.forEach { it.reject(message) }
    pending.clear()
  }
}
