package com.namehamal.tracker.ui.tracking

import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.SessionRepository
import com.namehamal.tracker.data.local.TimeIntervalEntity
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TrackingCategoryTest {
    private val now = Instant.parse("2026-09-27T12:00:00Z")
    private val planning = category("planning", "Planning")
    private val support = category("support", "Support", sortOrder = 20)

    @Test
    fun newCompletedAndRunningSessionsRequireAnActiveSelection() = runTest {
        val repository = FakeSessionRepository(listOf(planning))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.saveCompleted()
        runCurrent()
        viewModel.start()
        runCurrent()

        assertTrue(repository.created.isEmpty())
        assertTrue(repository.started.isEmpty())
        assertTrue(viewModel.state.value.isError)

        viewModel.selectCategory(planning.categoryId)
        viewModel.saveCompleted()
        runCurrent()
        viewModel.editTitle("Focus")
        viewModel.start()
        runCurrent()

        assertEquals(listOf("planning"), repository.created.map { it.categoryId })
        assertEquals(listOf("planning"), repository.started.map { it.categoryId })
    }

    @Test
    fun changingCategoryAppliesOnlyToTheNewRecord() = runTest {
        val previous = event("previous", "Planning", "planning", 1_000L, 2_000L)
        val repository = FakeSessionRepository(listOf(planning, support), listOf(previous))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()
        viewModel.editTitle("Support work")
        viewModel.selectCategory(support.categoryId)
        viewModel.saveCompleted()
        runCurrent()

        assertEquals("planning", repository.events.value.first { it.entryId == "previous" }.categoryId)
        assertEquals("support", repository.created.single().categoryId)
    }

    @Test
    fun choosingSavedActivityPrefillsItsTitleAndCategoryAndKeepsItsIdentity() = runTest {
        val activity = activity("activity-planning", "Planning", "planning")
        val repository = FakeSessionRepository(listOf(planning, support), activities = listOf(activity))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.selectActivity(activity.activityId)
        assertEquals("Planning", viewModel.state.value.title)
        assertEquals("planning", viewModel.state.value.selectedCategoryId)
        assertEquals(activity.activityId, viewModel.state.value.selectedActivityId)

        viewModel.start()
        runCurrent()
        assertEquals(activity.activityId, repository.started.single().activityId)
        assertEquals("planning", repository.started.single().categoryId)

        viewModel.editTitle("Custom work")
        viewModel.start()
        runCurrent()
        assertNull(repository.started.last().activityId)
        assertEquals("Custom work", repository.started.last().title)
    }

    @Test
    fun recentCustomTitleCanBeSelectedAndStartedWithoutDesktopActivityIdentity() = runTest {
        val previous = event("previous-custom", "One-off work", "support", 1_000L, 2_000L)
        val repository = FakeSessionRepository(listOf(planning, support), listOf(previous))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.selectRecentTitle("One-off work")
        assertEquals("One-off work", viewModel.state.value.title)
        assertEquals("support", viewModel.state.value.selectedCategoryId)
        assertNull(viewModel.state.value.selectedActivityId)

        viewModel.start()
        runCurrent()

        assertEquals("One-off work", repository.started.single().title)
        assertEquals("support", repository.started.single().categoryId)
        assertNull(repository.started.single().activityId)
    }

    @Test
    fun restartPreselectsOnlyAStillActiveSourceCategory() = runTest {
        val source = event("source", "Planning", "planning", 1_000L, 2_000L)
        val archivedSource = event("archived-source", "Old work", "archived", 3_000L, 4_000L)
        val repository = FakeSessionRepository(listOf(planning, support), listOf(source, archivedSource))
        val viewModel = viewModel(repository, backgroundScope)
        runCurrent()

        viewModel.prepareRestart(source)
        assertEquals("planning", viewModel.state.value.selectedCategoryId)
        assertEquals("Planning", viewModel.state.value.title)
        viewModel.prepareRestart(archivedSource)
        assertNull(viewModel.state.value.selectedCategoryId)

        viewModel.selectCategory(support.categoryId)
        viewModel.prepareRestart(source)
        viewModel.selectCategory(support.categoryId)
        viewModel.start()
        runCurrent()

        assertEquals("planning", repository.events.value.first { it.entryId == "source" }.categoryId)
        assertEquals("support", repository.started.single().categoryId)
        assertFalse(repository.started.single().entryId == source.entryId)
    }

    private fun viewModel(repository: FakeSessionRepository, scope: kotlinx.coroutines.CoroutineScope) = TrackingViewModel(
        repository = repository,
        now = { now },
        zoneId = { java.time.ZoneId.of("UTC") },
        coroutineScope = scope,
    )

    private class FakeSessionRepository(
        categories: List<CategorySnapshotEntity>,
        initial: List<TimeIntervalEntity> = emptyList(),
        activities: List<ActivitySnapshotEntity> = emptyList(),
    ) : SessionRepository {
        private val categoryFlow = MutableStateFlow(categories)
        private val activityFlow = MutableStateFlow(activities)
        val events = MutableStateFlow(initial)
        val created = mutableListOf<TimeIntervalEntity>()
        val started = mutableListOf<TimeIntervalEntity>()

        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = activityFlow
        override fun observeCategories(): Flow<List<CategorySnapshotEntity>> = categoryFlow
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = events
        override fun observeTitleSuggestions(): Flow<List<String>> = events.map(SessionFeedRules::previousTitles)

        override suspend fun createCompletedSession(
            title: String,
            startedAtLocal: String,
            endedAtLocal: String,
            categoryId: String,
            zoneId: String,
            now: Instant,
            activityId: String?,
        ): TimeIntervalEntity = event("created-${created.size}", title, categoryId, 1_000L, 2_000L, activityId).also {
            created.add(it)
            events.value = events.value + it
        }

        override suspend fun startSession(
            title: String,
            startedAtLocal: String,
            categoryId: String,
            zoneId: String,
            now: Instant,
            activityId: String?,
        ): TimeIntervalEntity = event("started-${started.size}", title, categoryId, 3_000L, activityId = activityId).also {
            started.add(it)
            events.value = events.value + it
        }

        override suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity = error("not used")
        override suspend fun removeSession(entryId: String): Boolean = error("not used")
        override suspend fun removeSessions(entryIds: Set<String>): Int = error("not used")
        override suspend fun clearAllSessions(): Int = error("not used")
        override suspend fun clearSyncedSessions(): Int = error("not used")
    }

    companion object {
        private fun category(id: String, name: String, sortOrder: Int = 10) = CategorySnapshotEntity(
            categoryId = id,
            name = name,
            sortOrder = sortOrder,
            isArchived = false,
            receivedAt = 1L,
        )

        private fun event(
            id: String,
            title: String,
            categoryId: String?,
            startedAt: Long,
            endedAt: Long? = null,
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

        private fun activity(id: String, title: String, categoryId: String) = ActivitySnapshotEntity(
            activityId = id,
            title = title,
            categoryId = categoryId,
            color = null,
            sortOrder = 0,
            isArchived = false,
            snapshotVersion = id,
            receivedAt = 1L,
        )
    }
}
