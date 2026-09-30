package com.namehamal.tracker.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.namehamal.tracker.MainActivity

object CheckInNotification {
    const val CHANNEL_ID = "workday-check-ins"
    const val SESSION_CHANNEL_ID = "session-check-ins"
    const val BODY = "What have you been working on?"
    const val ACTION_SAME_ACTIVITY = "Same activity"
    const val ACTION_STILL_WORKING = "Still working"
    const val PERMISSION_EXPLANATION = "Allow notifications for hourly check-ins. Your offline timeline remains available for review if notifications are denied or delayed."

    /** Reminder copy for a running manual session; names the tracked activity when unlocked. */
    fun sessionBody(title: String): String =
        "Still working on \"$title\"? Confirm or open to update your tracking."

    fun canNotify(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED) && NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** Workday check-in reminder retained for the retired workday flow. */
    fun show(context: Context, checkInId: String): Boolean = notify(
        context = context,
        checkInId = checkInId,
        channelId = CHANNEL_ID,
        channelName = "Workday check-ins",
        body = BODY,
        actionLabel = ACTION_SAME_ACTIVITY,
    )

    /** Hourly reminder for a running manual session. */
    fun showSession(context: Context, checkInId: String, sessionTitle: String): Boolean = notify(
        context = context,
        checkInId = checkInId,
        channelId = SESSION_CHANNEL_ID,
        channelName = "Session check-ins",
        body = sessionBody(sessionTitle),
        actionLabel = ACTION_STILL_WORKING,
    )

    private fun notify(
        context: Context,
        checkInId: String,
        channelId: String,
        channelName: String,
        body: String,
        actionLabel: String,
    ): Boolean {
        if (!canNotify(context)) return false
        createChannel(context, channelId, channelName)
        val requestCode = checkInId.hashCode()
        val confirm = PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, CheckInActionReceiver::class.java)
                .setAction(CheckInActionReceiver.ACTION_CONFIRM)
                .putExtra(CheckInActionReceiver.EXTRA_CHECK_IN_ID, checkInId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val openApp = PendingIntent.getActivity(
            context,
            requestCode + 1,
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Time check-in")
            .setContentText(body)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .addAction(0, actionLabel, confirm)
            .build()
        NotificationManagerCompat.from(context).notify(requestCode, notification)
        return true
    }

    private fun createChannel(context: Context, channelId: String, channelName: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_DEFAULT),
        )
    }
}
