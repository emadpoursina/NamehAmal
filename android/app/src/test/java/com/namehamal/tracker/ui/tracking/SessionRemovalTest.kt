package com.namehamal.tracker.ui.tracking

import com.namehamal.tracker.data.local.SessionRepository
import com.namehamal.tracker.data.local.TimeIntervalEntity
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRemovalTest {
    @Test
    fun cancellingCompletedOrRunningRemovalDoesNotChangeEvents() = runTest {
        val completed = event("done", endedAt = 2_000L)
        val running = event("running")
        val repository = FakeSessionRepository(listOf(completed, running))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.requestRemove(completed)
        viewModel.cancelRemove()
        viewModel.requestRemove(running)
        viewModel.cancelRemove()
        runCurrent()

        assertEquals(listOf(completed, running), repository.events.value)
        assertEquals(0, repository.removeCalls)
        assertEquals(0, repository.clearCalls)
        assertFalse(viewModel.state.value.confirmClearSynced)
    }

    @Test
    fun removalRunsOnlyAfterConfirmationAndClearingKeepsPendingEvents() = runTest {
        val synced = event("synced", endedAt = 2_000L, syncedAt = 3_000L)
        val pending = event("pending", endedAt = 2_000L)
        val running = event("running")
        val repository = FakeSessionRepository(listOf(synced, pending, running))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.requestRemove(running)
        assertEquals(0, repository.removeCalls)
        viewModel.confirmRemove()
        runCurrent()
        assertEquals(1, repository.removeCalls)
        assertFalse(repository.events.value.any { it.entryId == running.entryId })

        viewModel.requestClearSynced()
        viewModel.cancelClearSynced()
        runCurrent()
        assertTrue(repository.events.value.any { it.entryId == synced.entryId })
        assertEquals(0, repository.clearCalls)

        viewModel.requestClearSynced()
        viewModel.confirmClearSynced()
        runCurrent()
        assertEquals(1, repository.clearCalls)
        assertFalse(repository.events.value.any { it.entryId == synced.entryId })
        assertTrue(repository.events.value.any { it.entryId == pending.entryId })
    }

    private fun viewModel(repository: FakeSessionRepository, scope: CoroutineScope) = TrackingViewModel(
        repository = repository,
        now = { Instant.ofEpochMilli(10_000L) },
        zoneId = { java.time.ZoneId.of("UTC") },
        coroutineScope = scope,
    )

    private class FakeSessionRepository(initial: List<TimeIntervalEntity>) : SessionRepository {
        val events = MutableStateFlow(initial)
        var removeCalls = 0
        var clearCalls = 0

        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = events
        override fun observeTitleSuggestions(): Flow<List<String>> =
            MutableStateFlow(SessionFeedRules.previousTitles(events.value))

        override suspend fun createCompletedSession(
            title: String,
            startedAtLocal: String,
            endedAtLocal: String,
            zoneId: String,
            now: Instant,
        ): TimeIntervalEntity = error("not used")

        override suspend fun startSession(
            title: String,
            startedAtLocal: String,
            zoneId: String,
            now: Instant,
        ): TimeIntervalEntity = error("not used")

        override suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity = error("not used")

        override suspend fun removeSession(entryId: String): Boolean {
            removeCalls += 1
            events.value = events.value.filterNot { it.entryId == entryId }
            return true
        }

        override suspend fun clearSyncedSessions(): Int {
            clearCalls += 1
            val before = events.value.size
            events.value = events.value.filter { it.syncedAt == null }
            return before - events.value.size
        }
    }

    companion object {
        private fun event(id: String, endedAt: Long? = null, syncedAt: Long? = null) = TimeIntervalEntity(
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
            syncedAt = syncedAt,
        )
    }
}
