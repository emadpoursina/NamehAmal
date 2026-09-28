package com.namehamal.tracker.notifications

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

class CheckInScheduler(context: Context) {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    fun schedule(workdayId: String) {
        val request = PeriodicWorkRequestBuilder<CheckInWorker>(INTERVAL_MINUTES, TimeUnit.MINUTES)
            .setInputData(workDataOf(CheckInWorker.WORKDAY_ID to workdayId))
            .addTag(CheckInWorker.TAG)
            .build()
        workManager.enqueueUniquePeriodicWork(
            uniqueWorkName(workdayId), ExistingPeriodicWorkPolicy.KEEP, request,
        )
    }

    fun cancel(workdayId: String? = null) {
        if (workdayId == null) {
            workManager.cancelAllWorkByTag(CheckInWorker.TAG)
        } else {
            workManager.cancelUniqueWork(uniqueWorkName(workdayId))
        }
    }

    companion object {
        const val INTERVAL_MINUTES = 60L
        fun uniqueWorkName(workdayId: String) = "workday-check-in-$workdayId"
    }
}

object CheckInPolicy {
    fun shouldNotify(activeWorkdayId: String?, scheduledWorkdayId: String): Boolean =
        activeWorkdayId != null && activeWorkdayId == scheduledWorkdayId

    fun confirmationForMissedCheckIn(): String = "UNCONFIRMED"
}
