package com.namehamal.tracker.domain

import com.namehamal.tracker.data.local.SessionRepository
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.ui.tracking.SessionFeedRules
import com.namehamal.tracker.ui.tracking.TrackingViewModel
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PreviousActivityAndFeedTest {
    private val now = Instant.parse("2026-09-27T12:00:00Z")

    @Test
    fun feedSortsNewestFirstAndUsesEntryIdForStableEqualTimeOrder() {
        val equalTime = Instant.parse("2026-09-27T10:00:00Z").toEpochMilli()
        val events = listOf(
            event("a", "same", equalTime),
            event("z", "same", equalTime),
            event("older", "Old", equalTime - 1),
        )
        assertEquals(listOf("z", "a", "older"), SessionFeedRules.newestFirst(events).map { it.entryId })
        assertEquals(listOf("same", "Old"), SessionFeedRules.previousTitles(events))
    }

    @Test
    fun startingAgainCreatesDistinctRunningEventAndKeepsPreviousRecord() = runTest {
        val original = event("original", "Planning", now.minusSeconds(3_600).toEpochMilli(), now.toEpochMilli())
        val repository = FakeSessionRepository(listOf(original))
        val viewModel = TrackingViewModel(
            repository = repository,
            now = { now },
            zoneId = { java.time.ZoneId.of("UTC") },
            coroutineScope = backgroundScope,
        )
        runCurrent()

        viewModel.prepareRestart(original)
        assertEquals("planning", viewModel.state.value.selectedCategoryId)
        viewModel.start()
        runCurrent()

        assertEquals(2, repository.events.value.size)
        val restarted = repository.events.value.first { it.entryId != original.entryId }
        assertNotEquals(original.entryId, restarted.entryId)
        assertEquals("Planning", restarted.title)
        assertNull(restarted.endedAt)
        assertEquals(original, repository.events.value.first { it.entryId == original.entryId })
    }

    private class FakeSessionRepository(initial: List<TimeIntervalEntity>) : SessionRepository {
        val events = MutableStateFlow(initial)
        private val categories = MutableStateFlow(
            listOf(CategorySnapshotEntity("planning", "Planning", 0, false, 1L)),
        )
        private val activities = MutableStateFlow(emptyList<ActivitySnapshotEntity>())
        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = activities
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = events
        override fun observeCategories(): Flow<List<CategorySnapshotEntity>> = categories
        override fun observeTitleSuggestions(): Flow<List<String>> = events.map(SessionFeedRules::previousTitles)

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
            val start = Instant.parse("${startedAtLocal.replace(' ', 'T')}:00Z")
            val next = event(
                "new-${events.value.size}",
                title,
                start.toEpochMilli(),
                categoryId = categoryId,
                activityId = activityId,
            )
            events.value = events.value + next
            return next
        }

        override suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity = error("not used")
        override suspend fun removeSession(entryId: String): Boolean = error("not used")
        override suspend fun removeSessions(entryIds: Set<String>): Int = error("not used")
        override suspend fun clearAllSessions(): Int = error("not used")
        override suspend fun clearSyncedSessions(): Int = error("not used")
    }

    companion object {
        private fun event(
            id: String,
            title: String,
            startedAt: Long,
            endedAt: Long? = null,
            categoryId: String? = "planning",
            activityId: String? = null,
        ) = TimeIntervalEntity(
            entryId = id,
            workdayId = null,
            entryType = "WORK",
            activityId = activityId,
            categoryId = categoryId,
            startedAt = startedAt,
            endedAt = endedAt,
            timeZoneId = "UTC",
            timeZoneOffsetMinutes = 0,
            confirmationState = "CONFIRMED",
            sourceDeviceId = "device",
            updatedAt = startedAt,
            title = title,
        )
    }
}
