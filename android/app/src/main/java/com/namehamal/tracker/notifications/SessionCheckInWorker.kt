package com.namehamal.tracker.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.namehamal.tracker.TrackerApplication
import com.namehamal.tracker.data.local.SessionCheckIn
import com.namehamal.tracker.data.local.TimelineRepository
import java.time.Instant

class SessionCheckInWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val entryId = inputData.getString(ENTRY_ID) ?: return Result.success()
        val app = applicationContext as? TrackerApplication ?: return Result.failure()
        runSessionCheckIn(app.timelineRepository, entryId, Instant.now()) { checkIn ->
            CheckInNotification.showSession(applicationContext, checkIn.checkInId, checkIn.title)
        }
        return Result.success()
    }

    companion object {
        const val ENTRY_ID = "entryId"

        suspend fun runSessionCheckIn(
            repository: TimelineRepository,
            entryId: String,
            dueAt: Instant,
            notify: (SessionCheckIn) -> Boolean,
        ): Boolean {
            val checkIn = repository.recordSessionCheckIn(entryId, dueAt) ?: return false
            if (notify(checkIn)) {
                repository.markCheckInDelivered(checkIn.checkInId, Instant.now())
            } else {
                repository.markCheckInMissed(checkIn.checkInId)
            }
            return true
        }
    }
}
