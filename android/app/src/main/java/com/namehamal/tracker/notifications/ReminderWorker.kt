package com.namehamal.tracker.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.namehamal.tracker.TrackerApplication
import com.namehamal.tracker.data.settings.ReminderSettings
import com.namehamal.tracker.data.settings.ReminderSettingsSource
import java.time.ZonedDateTime
import kotlinx.coroutines.flow.first

/**
 * One run of the always-on fixed-cycle reminder (FR-006, FR-016).
 *
 * When reminders are disabled it does nothing and schedules nothing. Otherwise it posts the neutral
 * reminder when the current local time is inside the window and notifications are permitted, then
 * enqueues the next trigger computed from the device's current local zone. It posts nothing outside
 * the window (or for an empty window) but still schedules the next allowed trigger.
 */
class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? TrackerApplication ?: return Result.failure()
        val store = app.reminderSettingsStore
        val settings = store.settings.first()
        if (!settings.enabled) return Result.success()
        runReminder(
            settings = settings,
            now = ZonedDateTime.now(),
            permitted = ReminderNotification.canNotify(applicationContext),
            post = { ReminderNotification.post(applicationContext) },
            scheduleNext = { app.reminderScheduler.scheduleNext(settings) },
        )
        return Result.success()
    }

    companion object {
        /**
         * Decides and performs one reminder run; extracted so the window/permission rules are
         * testable without Android notification infrastructure.
         */
        fun runReminder(
            settings: ReminderSettings,
            now: ZonedDateTime,
            permitted: Boolean,
            post: () -> Boolean,
            scheduleNext: () -> Unit,
        ): Boolean {
            if (!settings.enabled) return false
            val withinWindow = ReminderSchedule.isWithinWindow(
                now = now,
                windowStartMinutes = settings.windowStartMinutes,
                windowEndMinutes = settings.windowEndMinutes,
            )
            // Always schedule the next trigger, even when this run is skipped (outside the window
            // or not permitted) and even when post() throws (e.g. a revoked permission between
            // the check and notify): otherwise one skipped/failed run kills the hourly chain.
            var posted = false
            try {
                posted = withinWindow && permitted && post()
            } finally {
                scheduleNext()
            }
            return posted
        }
    }
}
