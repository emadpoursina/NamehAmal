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
    const val BODY = "What have you been working on?"
    const val ACTION_SAME_ACTIVITY = "Same activity"
    const val PERMISSION_EXPLANATION = "Allow notifications for hourly check-ins. Your offline timeline remains available for review if notifications are denied or delayed."

    fun canNotify(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED) && NotificationManagerCompat.from(context).areNotificationsEnabled()

    fun show(context: Context, checkInId: String): Boolean {
        if (!canNotify(context)) return false
        createChannel(context)
        val requestCode = checkInId.hashCode()
        val sameActivity = PendingIntent.getBroadcast(
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
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Time check-in")
            .setContentText(BODY)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .addAction(0, ACTION_SAME_ACTIVITY, sameActivity)
            .build()
        NotificationManagerCompat.from(context).notify(requestCode, notification)
        return true
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Workday check-ins", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }
}
