package com.namehamal.tracker.notifications

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.namehamal.tracker.data.settings.ReminderSettings
import java.time.Duration
import java.time.Instant
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/**
 * Scheduling seam so the settings ViewModel can be unit-tested without WorkManager.
 */
interface ReminderScheduling {
    /** Enqueue the next reminder for [settings]; cancels the chain when disabled or unschedulable. */
    fun scheduleNext(settings: ReminderSettings)

    /** Cancel all reminder work; nothing remains scheduled. */
    fun cancelAll()

    /** Cancel then re-enqueue so a cycle/window change governs subsequent reminders (FR-009). */
    fun reschedule(settings: ReminderSettings)
}

/**
 * A unique one-time WorkManager chain (name/tag `reminder-cycle`) that re-enqueues itself after each
 * run (research decision 3). Unlike a periodic request it can restart exactly at the daily window
 * opening and stop at the boundary, and it models overnight windows.
 */
class ReminderScheduler(
    context: Context,
    private val now: () -> ZonedDateTime = { ZonedDateTime.now() },
) : ReminderScheduling {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    override fun scheduleNext(settings: ReminderSettings) {
        workManager.cancelUniqueWork(UNIQUE_WORK_NAME)
        if (!settings.enabled) return
        val next = ReminderSchedule.nextTrigger(
            now = now(),
            windowStartMinutes = settings.windowStartMinutes,
            windowEndMinutes = settings.windowEndMinutes,
            intervalMinutes = settings.intervalMinutes,
        ) ?: return
        val delayMillis = Duration.between(Instant.now(), next).toMillis().coerceAtLeast(0L)
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
            .addTag(TAG)
            .build()
        workManager.enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    override fun cancelAll() {
        workManager.cancelUniqueWork(UNIQUE_WORK_NAME)
        workManager.cancelAllWorkByTag(TAG)
    }

    override fun reschedule(settings: ReminderSettings) {
        cancelAll()
        scheduleNext(settings)
    }

    companion object {
        const val UNIQUE_WORK_NAME = "reminder-cycle"
        const val TAG = "reminder-cycle"
    }
}
