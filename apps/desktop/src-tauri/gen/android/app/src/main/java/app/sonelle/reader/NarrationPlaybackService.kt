package app.sonelle.reader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.graphics.drawable.Icon
import androidx.core.app.ServiceCompat

internal data class LockScreenControlDecision(
  val emit: String? = null,
  val playing: Boolean,
  val stop: Boolean = false
)

internal class LockScreenControlPolicy(initiallyPlaying: Boolean = false) {
  var playing = initiallyPlaying
    private set

  fun project(isPlaying: Boolean) {
    playing = isPlaying
  }

  fun accept(control: String): LockScreenControlDecision = when (control) {
    "play" -> if (playing) LockScreenControlDecision(playing = true) else {
      playing = true
      LockScreenControlDecision(emit = "play", playing = true)
    }
    "pause" -> if (!playing) LockScreenControlDecision(playing = false) else {
      playing = false
      LockScreenControlDecision(emit = "pause", playing = false)
    }
    "stop" -> {
      playing = false
      LockScreenControlDecision(emit = "stop", playing = false, stop = true)
    }
    "previous", "next" -> LockScreenControlDecision(emit = control, playing = playing)
    else -> LockScreenControlDecision(playing = playing)
  }
}

class NarrationPlaybackService : Service() {
  private var bookTitle = "Sonelle"
  private var author = ""
  private var chapterTitle = ""
  private var sentenceIndex = 0
  private var sentenceCount = 0
  private val controlPolicy = LockScreenControlPolicy()
  private lateinit var mediaSession: MediaSession

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    mediaSession = MediaSession(this, "SonelleNarration").apply {
      setCallback(object : MediaSession.Callback() {
        override fun onPlay() = handleControl("play")
        override fun onPause() = handleControl("pause")
        override fun onStop() = handleControl("stop")
        override fun onSkipToPrevious() = handleControl("previous")
        override fun onSkipToNext() = handleControl("next")
      })
      isActive = true
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CONTROL -> handleControl(intent.getStringExtra(EXTRA_CONTROL).orEmpty())
      ACTION_UPDATE -> {
        bookTitle = intent.getStringExtra(EXTRA_BOOK_TITLE).orEmpty().ifBlank { "Sonelle" }
        author = intent.getStringExtra(EXTRA_AUTHOR).orEmpty()
        chapterTitle = intent.getStringExtra(EXTRA_CHAPTER_TITLE).orEmpty()
        sentenceIndex = intent.getIntExtra(EXTRA_SENTENCE_INDEX, 0).coerceAtLeast(0)
        sentenceCount = intent.getIntExtra(EXTRA_SENTENCE_COUNT, 0).coerceAtLeast(0)
        controlPolicy.project(intent.getBooleanExtra(EXTRA_PLAYING, false))
        publishSession()
      }
    }
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    mediaSession.isActive = false
    mediaSession.release()
    super.onDestroy()
  }

  private fun handleControl(control: String) {
    val decision = controlPolicy.accept(control)
    decision.emit?.let {
      sendBroadcast(Intent(CONTROL_EVENT).apply {
        setPackage(packageName)
        putExtra(EXTRA_CONTROL, it)
      })
    }
    if (decision.stop) stopPlaybackService() else publishSession()
  }

  private fun publishSession() {
    mediaSession.setMetadata(
      MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, bookTitle)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, author)
        .putString(MediaMetadata.METADATA_KEY_ALBUM, chapterTitle)
        .putLong(MediaMetadata.METADATA_KEY_TRACK_NUMBER, (sentenceIndex + 1).toLong())
        .putLong(MediaMetadata.METADATA_KEY_NUM_TRACKS, sentenceCount.toLong())
        .build()
    )
    mediaSession.setPlaybackState(
      PlaybackState.Builder()
        .setActions(LOCK_SCREEN_ACTIONS)
        .setState(
          if (controlPolicy.playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
          PlaybackState.PLAYBACK_POSITION_UNKNOWN,
          if (controlPolicy.playing) 1f else 0f
        )
        .build()
    )
    showNotification()
  }

  private fun showNotification() {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, pendingIntentFlags())
    }
    val toggleControl = if (controlPolicy.playing) "pause" else "play"
    val toggleIcon = if (controlPolicy.playing) android.R.drawable.ic_media_pause
      else android.R.drawable.ic_media_play
    val toggleLabel = if (controlPolicy.playing) "Pause" else "Resume"
    val subtitle = listOf(chapterTitle, author).filter(String::isNotBlank).joinToString(" · ")
    val notification = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(bookTitle)
      .setContentText(subtitle.ifBlank { "Reading with Sonelle" })
      .setContentIntent(contentIntent)
      .setOnlyAlertOnce(true)
      .setOngoing(controlPolicy.playing)
      .setCategory(Notification.CATEGORY_TRANSPORT)
      .setStyle(Notification.MediaStyle().setMediaSession(mediaSession.sessionToken)
        .setShowActionsInCompactView(0, 1, 2))
      .addAction(notificationAction(android.R.drawable.ic_media_previous, "Previous sentence", "previous", 1))
      .addAction(notificationAction(toggleIcon, toggleLabel, toggleControl, 2))
      .addAction(notificationAction(android.R.drawable.ic_media_next, "Next sentence", "next", 3))
      .addAction(notificationAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", "stop", 4))
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

  private fun notificationAction(icon: Int, label: String, control: String, requestCode: Int) =
    Notification.Action.Builder(
      Icon.createWithResource(this, icon),
      label,
      controlIntent(control, requestCode)
    ).build()

  private fun pendingIntentFlags() = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun stopPlaybackService() {
    mediaSession.isActive = false
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
    const val EXTRA_SENTENCE_INDEX = "sentenceIndex"
    const val EXTRA_SENTENCE_COUNT = "sentenceCount"
    const val EXTRA_PLAYING = "playing"
    const val EXTRA_CONTROL = "control"
    private const val CHANNEL_ID = "narration-playback"
    private const val NOTIFICATION_ID = 814
    private const val LOCK_SCREEN_ACTIONS = PlaybackState.ACTION_PLAY or
      PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
      PlaybackState.ACTION_STOP or PlaybackState.ACTION_SKIP_TO_PREVIOUS or
      PlaybackState.ACTION_SKIP_TO_NEXT
  }
}
