package com.namehamal.tracker.ui.tracking

import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
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
class SessionBulkRemovalTest {
    @Test
    fun individualSelectionSelectAllAndClearSelectionDoNotDeleteRows() = runTest {
        val initial = listOf(event("one"), event("two"), event("running", endedAt = null))
        val repository = FakeSessionRepository(initial)
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.toggleSelection("one")
        viewModel.toggleSelection("two")
        assertEquals(setOf("one", "two"), viewModel.state.value.selectedEntryIds)
        viewModel.selectAll()
        assertEquals(setOf("one", "two", "running"), viewModel.state.value.selectedEntryIds)
        viewModel.clearSelection()
        runCurrent()

        assertTrue(viewModel.state.value.selectedEntryIds.isEmpty())
        assertEquals(initial, repository.events.value)
        assertTrue(repository.removalRequests.isEmpty())
        assertEquals(0, repository.clearAllCalls)
    }

    @Test
    fun selectedRemovalRequiresConfirmationAndCancellationKeepsEveryRow() = runTest {
        val initial = listOf(event("one"), event("two"), event("running", endedAt = null))
        val repository = FakeSessionRepository(initial)
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()
        viewModel.toggleSelection("one")
        viewModel.toggleSelection("running")
        viewModel.requestRemoveSelected()

        assertEquals(setOf("one", "running"), viewModel.state.value.pendingBulkRemovalIds)
        viewModel.cancelRemoveSelected()
        runCurrent()
        assertEquals(initial, repository.events.value)
        assertTrue(repository.removalRequests.isEmpty())

        viewModel.requestRemoveSelected()
        viewModel.confirmRemoveSelected()
        runCurrent()

        assertEquals(listOf(setOf("one", "running")), repository.removalRequests)
        assertEquals(listOf("two"), repository.events.value.map { it.entryId })
        assertTrue(viewModel.state.value.selectedEntryIds.isEmpty())
        assertFalse(viewModel.state.value.pendingBulkRemovalIds != null)
    }

    @Test
    fun clearAllConfirmationTargetsUnselectedRowsAndIsSeparateFromSelection() = runTest {
        val initial = listOf(event("selected"), event("unselected"), event("running", endedAt = null))
        val repository = FakeSessionRepository(initial)
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()
        viewModel.toggleSelection("selected")

        viewModel.requestClearAll()
        assertTrue(viewModel.state.value.confirmClearAll)
        viewModel.cancelClearAll()
        runCurrent()
        assertEquals(initial, repository.events.value)
        assertEquals(0, repository.clearAllCalls)
        assertEquals(setOf("selected"), viewModel.state.value.selectedEntryIds)

        viewModel.requestClearAll()
        viewModel.confirmClearAll()
        runCurrent()

        assertEquals(1, repository.clearAllCalls)
        assertTrue(repository.events.value.isEmpty())
        assertTrue(viewModel.state.value.selectedEntryIds.isEmpty())
    }

    private fun viewModel(repository: FakeSessionRepository, scope: CoroutineScope) = TrackingViewModel(
        repository = repository,
        now = { Instant.ofEpochMilli(10_000L) },
        zoneId = { java.time.ZoneId.of("UTC") },
        coroutineScope = scope,
    )

    private class FakeSessionRepository(initial: List<TimeIntervalEntity>) : SessionRepository {
        private val categories = MutableStateFlow(emptyList<CategorySnapshotEntity>())
        val events = MutableStateFlow(initial)
        val removalRequests = mutableListOf<Set<String>>()
        var clearAllCalls = 0

        override fun observeCategories(): Flow<List<CategorySnapshotEntity>> = categories
        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = MutableStateFlow(emptyList())
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = events
        override fun observeTitleSuggestions(): Flow<List<String>> = MutableStateFlow(emptyList())

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
        ): TimeIntervalEntity = error("not used")

        override suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity = error("not used")
        override suspend fun removeSession(entryId: String): Boolean = error("not used")
        override suspend fun removeSessions(entryIds: Set<String>): Int {
            removalRequests.add(entryIds)
            val before = events.value.size
            events.value = events.value.filterNot { it.entryId in entryIds }
            return before - events.value.size
        }
        override suspend fun clearAllSessions(): Int {
            clearAllCalls += 1
            val count = events.value.size
            events.value = emptyList()
            return count
        }
        override suspend fun clearSyncedSessions(): Int = error("not used")
    }

    companion object {
        private fun event(id: String, endedAt: Long? = 2_000L) = TimeIntervalEntity(
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
            updatedAt = 2_000L,
            title = id,
        )
    }
}
