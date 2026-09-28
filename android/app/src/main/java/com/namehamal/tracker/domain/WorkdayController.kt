package com.namehamal.tracker.domain

import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.notifications.CheckInScheduler
import java.time.Clock
import java.time.Instant
import java.time.ZoneId

class WorkdayController(
    private val repository: TimelineRepository,
    private val scheduler: CheckInScheduler,
    private val clock: Clock = Clock.systemUTC(),
    private val zone: () -> ZoneId = { ZoneId.systemDefault() },
) {
    suspend fun startWorkday(activityId: String?) {
        val at = clock.instant()
        val currentZone = zone()
        val workday = repository.startWorkday(at, activityId, currentZone)
        scheduler.schedule(workday.workdayId)
    }

    suspend fun changeActivity(activityId: String?) =
        repository.changeActivity(activityId, clock.instant(), zone())

    suspend fun startBreak() = repository.startBreak(clock.instant(), zone())

    suspend fun resumeActivity(activityId: String?) =
        repository.resumeActivity(activityId, clock.instant(), zone())

    suspend fun endWorkday() {
        repository.endWorkday(clock.instant())
        scheduler.cancel()
    }

    companion object {
        fun requireNoActiveWorkday(hasActiveWorkday: Boolean) {
            check(!hasActiveWorkday) { "A workday is already active." }
        }
    }
}
