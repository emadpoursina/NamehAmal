package com.namehamal.tracker.notifications

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.namehamal.tracker.MainActivity

/** The neutral, activity-free content of a reminder notification (FR-017). */
data class ReminderContent(
    val title: String,
    val body: String,
    val actionLabel: String,
) {
    /** The reminder offers exactly one action. */
    val actions: List<String> get() = listOf(actionLabel)
}

/** Seam that lets tests assert the test trigger's immediate-post decision without a device. */
fun interface ReminderPoster {
    fun post(): Boolean
}

/**
 * The always-on fixed-cycle reminder notification (FR-016, FR-017).
 *
 * Copy is neutral and never names a tracked activity; the single action, `Open app`, launches
 * `MainActivity`. The same rendering is reused by the cycle worker and the Settings test trigger.
 */
object ReminderNotification {
    const val CHANNEL_ID = "reminders"
    const val CHANNEL_NAME = "Reminders"
    const val TITLE = "Time check-in"
    const val BODY = "What have you been working on?"
    const val ACTION_OPEN_APP = "Open app"
    const val NOTIFICATION_ID = 7301

    fun content(): ReminderContent = ReminderContent(TITLE, BODY, ACTION_OPEN_APP)

    fun canNotify(context: Context): Boolean = ReminderPermission.isGranted(context)

    /**
     * Posts the neutral reminder when notifications are permitted. Returns whether it was posted.
     * Reused by the cycle worker and the Settings test trigger.
     */
    fun post(context: Context): Boolean {
        if (!canNotify(context)) return false
        createChannel(context)
        val openApp = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(TITLE)
            .setContentText(BODY)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setVibrate(longArrayOf(0, 250, 250, 250))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .addAction(0, ACTION_OPEN_APP, openApp)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        return true
    }

    /**
     * The Settings test trigger: posts the same rendering immediately when permitted, regardless of
     * the enabled flag or the active window, and never mutates settings or scheduled work (FR-012,
     * FR-013).
     */
    fun testTrigger(permitted: Boolean, poster: ReminderPoster): Boolean =
        if (permitted) poster.post() else false

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Sound lives on the channel (API 26+): importance LOW/DEFAULT may stay silent, and
        // createNotificationChannel() never upgrades an existing channel, so a channel created by
        // an older install would stay silent forever. Delete and recreate when it is too quiet.
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null && existing.importance >= NotificationManager.IMPORTANCE_HIGH) return
        if (existing != null) manager.deleteNotificationChannel(CHANNEL_ID)
        val channel =
            NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Hourly reminders to check in on your tracking."
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
                setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), null)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            }
        manager.createNotificationChannel(channel)
    }
}
