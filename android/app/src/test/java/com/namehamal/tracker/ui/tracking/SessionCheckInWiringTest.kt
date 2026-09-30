package com.namehamal.tracker.ui.tracking

import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.SessionRepository
import com.namehamal.tracker.data.local.TimeIntervalEntity
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionCheckInWiringTest {
    @Test
    fun startingASessionSchedulesAndStoppingCancelsReminders() = runTest {
        val repository = FakeSessionRepository()
        val scheduled = mutableListOf<String>()
        var cancelled = 0
        val viewModel = TrackingViewModel(
            repository = repository,
            now = { Instant.ofEpochMilli(10_000L) },
            zoneId = { ZoneId.of("UTC") },
            onSessionStarted = { scheduled += it },
            onSessionStopped = { cancelled += 1 },
            coroutineScope = backgroundScope,
        )
        runCurrent()

        viewModel.selectCategory("cat")
        viewModel.editTitle("Focus")
        viewModel.start()
        runCurrent()

        val running = repository.events.value.single { it.endedAt == null }
        assertEquals(listOf(running.entryId), scheduled)
        assertEquals(0, cancelled)

        viewModel.stop(running.entryId)
        runCurrent()
        assertEquals(1, cancelled)
    }

    @Test
    fun removingTheRunningSessionCancelsRemindersButRemovingACompletedOneDoesNot() = runTest {
        val completed = event("done", endedAt = 2_000L)
        val running = event("running")
        val repository = FakeSessionRepository(listOf(completed, running))
        var cancelled = 0
        val viewModel = TrackingViewModel(
            repository = repository,
            now = { Instant.ofEpochMilli(10_000L) },
            zoneId = { ZoneId.of("UTC") },
            onSessionStopped = { cancelled += 1 },
            coroutineScope = backgroundScope,
        )
        runCurrent()

        viewModel.requestRemove(completed)
        viewModel.confirmRemove()
        runCurrent()
        assertEquals(0, cancelled)

        viewModel.requestRemove(running)
        viewModel.confirmRemove()
        runCurrent()
        assertEquals(1, cancelled)
    }

    private class FakeSessionRepository(initial: List<TimeIntervalEntity> = emptyList()) : SessionRepository {
        val events = MutableStateFlow(initial)
        private val categories = MutableStateFlow(
            listOf(CategorySnapshotEntity("cat", "Category", 0, false, 1L)),
        )

        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = MutableStateFlow(emptyList())
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = events
        override fun observeCategories(): Flow<List<CategorySnapshotEntity>> = categories
        override fun observeTitleSuggestions(): Flow<List<String>> =
            MutableStateFlow(SessionFeedRules.previousTitles(events.value))

        override suspend fun createCompletedSession(
            title: String,
            startedAtLocal: String,
            endedAtLocal: String,
            categoryId: String,
            zoneId: String,
            now: Instant,
            activityId: String?,
        ): TimeIntervalEntity = error("not used")

        override suspend fun startSession(
            title: String,
            startedAtLocal: String,
            categoryId: String,
            zoneId: String,
            now: Instant,
            activityId: String?,
        ): TimeIntervalEntity {
            val running = event("new-session").copy(title = title, categoryId = categoryId)
            events.value = events.value + running
            return running
        }

        override suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity {
            val stopped = events.value.first { it.entryId == entryId }.copy(endedAt = at.toEpochMilli())
            events.value = events.value.map { if (it.entryId == entryId) stopped else it }
            return stopped
        }

        override suspend fun removeSession(entryId: String): Boolean {
            events.value = events.value.filterNot { it.entryId == entryId }
            return true
        }

        override suspend fun removeSessions(entryIds: Set<String>): Int = error("not used")
        override suspend fun clearAllSessions(): Int = error("not used")
        override suspend fun clearSyncedSessions(): Int = error("not used")
    }

    companion object {
        private fun event(id: String, endedAt: Long? = null) = TimeIntervalEntity(
            entryId = id,
            workdayId = null,
            entryType = "WORK",
            activityId = null,
            startedAt = 1_000L,
            endedAt = endedAt,
            timeZoneId = "UTC",
            timeZoneOffsetMinutes = 0,
            confirmationState = "CONFIRMED",
            sourceDeviceId = "device",
            updatedAt = 1_000L,
            title = id,
        )
    }
}
