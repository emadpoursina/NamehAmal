package com.namehamal.tracker.notifications

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** Three-way notification permission state surfaced in Settings (FR-014). */
enum class ReminderPermissionState {
    /** Notifications can be delivered. */
    GRANTED,

    /** Not granted, but the runtime dialog can still be shown. */
    REQUESTABLE,

    /** Notifications disabled at the OS level, or the runtime permission is permanently denied. */
    BLOCKED,
}

/**
 * Notification-permission helpers: the `POST_NOTIFICATIONS` check for API 33+ plus
 * `areNotificationsEnabled()`, a three-way state, and the app notification-settings deep link.
 */
object ReminderPermission {
    private const val PREFS_NAME = "reminder-permission"
    private const val KEY_REQUESTED = "post_notifications_requested"

    fun isGranted(context: Context): Boolean {
        val runtimeGranted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        return runtimeGranted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun state(context: Context, canRequestInApp: Boolean): ReminderPermissionState = when {
        isGranted(context) -> ReminderPermissionState.GRANTED
        canRequestInApp -> ReminderPermissionState.REQUESTABLE
        else -> ReminderPermissionState.BLOCKED
    }

    /**
     * Context-only state used by the app-level ViewModel: requestable until the runtime dialog has
     * been launched once, then blocked (deep link) unless granted.
     */
    fun state(context: Context): ReminderPermissionState = when {
        isGranted(context) -> ReminderPermissionState.GRANTED
        Build.VERSION.SDK_INT < 33 -> ReminderPermissionState.BLOCKED
        !hasRequested(context) -> ReminderPermissionState.REQUESTABLE
        else -> ReminderPermissionState.BLOCKED
    }

    /**
     * True when the runtime dialog can still be shown: on API 33+, not granted, and either we have
     * not asked yet or the user did not choose "don't ask again".
     */
    fun canRequestInApp(activity: Activity): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        if (isGranted(activity)) return false
        return !hasRequested(activity) ||
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
    }

    /** Record that the runtime dialog was launched, so a later permanent denial reads as blocked. */
    fun markRequested(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_REQUESTED, true)
            .apply()
    }

    fun hasRequested(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_REQUESTED, false)

    /** Deep link to this app's system notification settings (FR-014). */
    fun systemSettingsIntent(context: Context): Intent =
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
