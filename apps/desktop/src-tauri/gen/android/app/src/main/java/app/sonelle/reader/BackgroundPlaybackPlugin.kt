package app.sonelle.reader

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class BackgroundPlaybackSubscriptionArgs {
  lateinit var onIntent: Channel
}

@InvokeArg
class BackgroundPlaybackSnapshotArgs {
  lateinit var bookTitle: String
  lateinit var author: String
  lateinit var chapterTitle: String
  var sentenceIndex: Int = 0
  var sentenceCount: Int = 0
  lateinit var playbackStatus: String
}

internal enum class BackgroundServiceCommand { START, UPDATE, STOP, IGNORE }

internal class BackgroundPlaybackPolicy {
  var serviceActive = false
    private set

  fun accept(playbackStatus: String): BackgroundServiceCommand = when (playbackStatus) {
    "playing" -> if (serviceActive) BackgroundServiceCommand.UPDATE else {
      serviceActive = true
      BackgroundServiceCommand.START
    }
    "paused" -> if (serviceActive) BackgroundServiceCommand.UPDATE else BackgroundServiceCommand.IGNORE
    "idle", "ended" -> if (serviceActive) {
      serviceActive = false
      BackgroundServiceCommand.STOP
    } else BackgroundServiceCommand.IGNORE
    else -> BackgroundServiceCommand.IGNORE
  }

  fun stoppedExternally() {
    serviceActive = false
  }
}

@TauriPlugin
class BackgroundPlaybackPlugin(private val activity: Activity) : Plugin(activity) {
  private val policy = BackgroundPlaybackPolicy()
  private var intentChannel: Channel? = null
  private var receiverRegistered = false
  private val controlReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      val control = intent.getStringExtra(NarrationPlaybackService.EXTRA_CONTROL) ?: return
      if (control == "stop") policy.stoppedExternally()
      intentChannel?.send(platformIntent(control) ?: return)
    }
  }

  override fun load(webView: WebView) {
    ContextCompat.registerReceiver(
      activity,
      controlReceiver,
      IntentFilter(NarrationPlaybackService.CONTROL_EVENT),
      ContextCompat.RECEIVER_NOT_EXPORTED
    )
    receiverRegistered = true
  }

  @Command
  fun subscribe(invoke: Invoke) {
    intentChannel = invoke.parseArgs(BackgroundPlaybackSubscriptionArgs::class.java).onIntent
    invoke.resolve(JSObject())
  }

  @Command
  fun publish(invoke: Invoke) {
    val snapshot = invoke.parseArgs(BackgroundPlaybackSnapshotArgs::class.java)
    when (policy.accept(snapshot.playbackStatus)) {
      BackgroundServiceCommand.START -> {
        requestNotificationPermission()
        ContextCompat.startForegroundService(activity, serviceIntent(snapshot))
      }
      BackgroundServiceCommand.UPDATE -> activity.startService(serviceIntent(snapshot))
      BackgroundServiceCommand.STOP -> stopService()
      BackgroundServiceCommand.IGNORE -> Unit
    }
    invoke.resolve(JSObject())
  }

  @Command
  fun clear(invoke: Invoke) {
    policy.stoppedExternally()
    stopService()
    invoke.resolve(JSObject())
  }

  override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
    policy.stoppedExternally()
    stopService()
    if (receiverRegistered) activity.unregisterReceiver(controlReceiver)
    receiverRegistered = false
    intentChannel = null
  }

  private fun serviceIntent(snapshot: BackgroundPlaybackSnapshotArgs) =
    Intent(activity, NarrationPlaybackService::class.java).apply {
      action = NarrationPlaybackService.ACTION_UPDATE
      putExtra(NarrationPlaybackService.EXTRA_BOOK_TITLE, snapshot.bookTitle)
      putExtra(NarrationPlaybackService.EXTRA_AUTHOR, snapshot.author)
      putExtra(NarrationPlaybackService.EXTRA_CHAPTER_TITLE, snapshot.chapterTitle)
      putExtra(NarrationPlaybackService.EXTRA_SENTENCE_INDEX, snapshot.sentenceIndex)
      putExtra(NarrationPlaybackService.EXTRA_SENTENCE_COUNT, snapshot.sentenceCount)
      putExtra(NarrationPlaybackService.EXTRA_PLAYING, snapshot.playbackStatus == "playing")
    }

  private fun stopService() {
    activity.stopService(Intent(activity, NarrationPlaybackService::class.java))
  }

  private fun requestNotificationPermission() {
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        NOTIFICATION_PERMISSION_REQUEST
      )
    }
  }

  private fun platformIntent(control: String): JSObject? = when (control) {
    "previous" -> JSObject().apply {
      put("type", "seek")
      put("sentenceOffset", -1)
      put("source", "platform")
    }
    "next" -> JSObject().apply {
      put("type", "seek")
      put("sentenceOffset", 1)
      put("source", "platform")
    }
    "output-disconnected" -> JSObject().apply {
      put("type", "output-disconnected")
    }
    "play", "pause", "stop" -> JSObject().apply {
      put("type", control)
      put("source", "platform")
    }
    else -> null
  }

  companion object {
    private const val NOTIFICATION_PERMISSION_REQUEST = 7412
  }
}
