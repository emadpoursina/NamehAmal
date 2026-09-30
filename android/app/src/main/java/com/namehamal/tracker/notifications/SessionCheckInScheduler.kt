package com.namehamal.tracker.notifications

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * Schedules approximately hourly check-in reminders while a manual session is running.
 * The first reminder arrives one interval after the session starts, repeats every interval,
 * and the work is cancelled as soon as that session stops or is removed.
 */
class SessionCheckInScheduler(context: Context) {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    fun schedule(entryId: String) {
        val request = PeriodicWorkRequestBuilder<SessionCheckInWorker>(INTERVAL_MINUTES, TimeUnit.MINUTES)
            .setInitialDelay(INTERVAL_MINUTES, TimeUnit.MINUTES)
            .setInputData(workDataOf(SessionCheckInWorker.ENTRY_ID to entryId))
            .addTag(TAG)
            .build()
        workManager.enqueueUniquePeriodicWork(
            uniqueWorkName(entryId), ExistingPeriodicWorkPolicy.KEEP, request,
        )
    }

    fun cancel(entryId: String) {
        workManager.cancelUniqueWork(uniqueWorkName(entryId))
    }

    fun cancelAll() {
        workManager.cancelAllWorkByTag(TAG)
    }

    companion object {
        const val INTERVAL_MINUTES = 60L
        const val TAG = "session-check-in"
        fun uniqueWorkName(entryId: String) = "session-check-in-$entryId"
    }
}
