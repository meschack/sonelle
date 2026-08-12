package app.sonelle.reader

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class NarrationPlaybackService : Service() {
  private var bookTitle = "Sonelle"
  private var author = ""
  private var chapterTitle = ""
  private var playing = true

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CONTROL -> handleControl(intent.getStringExtra(EXTRA_CONTROL))
      ACTION_UPDATE -> {
        bookTitle = intent.getStringExtra(EXTRA_BOOK_TITLE).orEmpty().ifBlank { "Sonelle" }
        author = intent.getStringExtra(EXTRA_AUTHOR).orEmpty()
        chapterTitle = intent.getStringExtra(EXTRA_CHAPTER_TITLE).orEmpty()
        playing = intent.getBooleanExtra(EXTRA_PLAYING, false)
        showNotification()
      }
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun handleControl(control: String?) {
    if (control !in setOf("play", "pause", "stop")) return
    sendBroadcast(Intent(CONTROL_EVENT).apply {
      setPackage(packageName)
      putExtra(EXTRA_CONTROL, control)
    })
    when (control) {
      "play" -> {
        playing = true
        showNotification()
      }
      "pause" -> {
        playing = false
        showNotification()
      }
      "stop" -> stopPlaybackService()
    }
  }

  private fun showNotification() {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, pendingIntentFlags())
    }
    val toggleControl = if (playing) "pause" else "play"
    val toggleIcon = if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
    val toggleLabel = if (playing) "Pause" else "Resume"
    val subtitle = listOf(chapterTitle, author).filter(String::isNotBlank).joinToString(" · ")
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(bookTitle)
      .setContentText(subtitle.ifBlank { "Reading with Sonelle" })
      .setContentIntent(contentIntent)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setOngoing(playing)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .addAction(toggleIcon, toggleLabel, controlIntent(toggleControl, 1))
      .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", controlIntent("stop", 2))
      .build()

    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      } else 0
    )
  }

  private fun controlIntent(control: String, requestCode: Int) = PendingIntent.getService(
    this,
    requestCode,
    Intent(this, NarrationPlaybackService::class.java).apply {
      action = ACTION_CONTROL
      putExtra(EXTRA_CONTROL, control)
    },
    pendingIntentFlags()
  )

  private fun pendingIntentFlags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun stopPlaybackService() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Narration playback",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Controls for the book Sonelle is reading aloud"
      setSound(null, null)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  companion object {
    const val ACTION_UPDATE = "app.sonelle.reader.action.UPDATE_BACKGROUND_PLAYBACK"
    const val ACTION_CONTROL = "app.sonelle.reader.action.CONTROL_BACKGROUND_PLAYBACK"
    const val CONTROL_EVENT = "app.sonelle.reader.event.BACKGROUND_PLAYBACK_CONTROL"
    const val EXTRA_BOOK_TITLE = "bookTitle"
    const val EXTRA_AUTHOR = "author"
    const val EXTRA_CHAPTER_TITLE = "chapterTitle"
    const val EXTRA_PLAYING = "playing"
    const val EXTRA_CONTROL = "control"
    private const val CHANNEL_ID = "narration-playback"
    private const val NOTIFICATION_ID = 814
  }
}
