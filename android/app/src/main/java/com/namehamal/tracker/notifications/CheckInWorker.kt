package com.namehamal.tracker.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.namehamal.tracker.TrackerApplication
import java.time.Instant

class CheckInWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val workdayId = inputData.getString(WORKDAY_ID) ?: return Result.success()
        val app = applicationContext as? TrackerApplication ?: return Result.failure()
        runCheckIn(app.timelineRepository, workdayId, Instant.now()) { checkInId ->
            CheckInNotification.show(applicationContext, checkInId)
        }
        return Result.success()
    }

    companion object {
        const val WORKDAY_ID = "workdayId"
        const val TAG = "workday-check-in"

        suspend fun runCheckIn(
            repository: com.namehamal.tracker.data.local.TimelineRepository,
            workdayId: String,
            dueAt: Instant,
            notify: (String) -> Boolean,
        ): Boolean {
            val checkInId = repository.recordCheckIn(workdayId, dueAt) ?: return false
            if (notify(checkInId)) {
                repository.markCheckInDelivered(checkInId, Instant.now())
            } else {
                repository.markCheckInMissed(checkInId)
            }
            return true
        }
    }
}
