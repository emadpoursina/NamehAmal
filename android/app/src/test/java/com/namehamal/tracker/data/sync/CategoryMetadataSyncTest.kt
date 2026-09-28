package com.namehamal.tracker.data.sync

import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategoryDao
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.ConflictDao
import com.namehamal.tracker.data.local.ConflictResolutionEntity
import com.namehamal.tracker.data.local.EntryRevisionEntity
import com.namehamal.tracker.data.local.SyncConflictEntity
import com.namehamal.tracker.data.local.SyncCursorEntity
import com.namehamal.tracker.data.local.SyncDao
import com.namehamal.tracker.data.local.SyncDeviceEntity
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.data.local.TimelineDao
import com.namehamal.tracker.data.local.WorkdayEntity
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CategoryMetadataSyncTest {
    private val endpoint = DesktopEndpoint("macbook.local", 3061)
    private val stamp = Instant.parse("2026-09-27T12:00:00Z").toEpochMilli()
    private val expectedCategories = listOf(
        category("first", "First", 10, archived = false),
        category("archived", "Archived", 20, archived = true),
    )
    private val expectedActivities = listOf(
        activity("writing", "Writing", "first", 10, archived = false),
        activity("archived-activity", "Archived activity", "first", 20, archived = true),
    )

    @Test
    fun explicitSyncRefreshesCategoriesAndActivitiesEvenWhenThereAreNoPendingEvents() = runTest {
        val categories = FakeCategoryDao()
        val timeline = FakeTimelineDao()
        val api = FakeApi(categories = expectedCategories, activities = expectedActivities)

        val outcome = repository(categories, api, timeline = timeline).syncUploadOnly(endpoint)

        assertTrue(outcome is SyncOutcome.Success)
        assertEquals(expectedCategories.map { it.copy(receivedAt = stamp) }, categories.rows)
        assertEquals(expectedActivities.map { it.copy(receivedAt = stamp) }, timeline.activityRows)
        assertTrue(api.exchangeBodies.isEmpty())
    }

    @Test
    fun missingCategoryCapabilityStopsBeforeUploadAndKeepsLastValidCache() = runTest {
        val oldCategory = category("cached", "Cached", 1, archived = false)
        val oldActivity = activity("cached-activity", "Cached activity", "cached", 1, archived = false)
        val categories = FakeCategoryDao(listOf(oldCategory))
        val timeline = FakeTimelineDao(initialActivities = listOf(oldActivity))
        val api = FakeApi(
            capabilities = listOf("entry-title", "upload-only", "category-metadata"),
            categories = expectedCategories,
            activities = expectedActivities,
        )

        val outcome = repository(categories, api, listOf(event("pending")), timeline = timeline).syncUploadOnly(endpoint)

        assertTrue(outcome is SyncOutcome.Failed)
        assertEquals(SyncFailureKind.VERSION, (outcome as SyncOutcome.Failed).kind)
        assertEquals(listOf(oldCategory), categories.rows)
        assertEquals(listOf(oldActivity), timeline.activityRows)
        assertTrue(api.exchangeBodies.isEmpty())
    }

    @Test
    fun offlineAndMalformedStatusResponsesPreserveTheLastValidCache() = runTest {
        val oldCategory = category("cached", "Cached", 1, archived = false)
        val oldActivity = activity("cached-activity", "Cached activity", "cached", 1, archived = false)
        val offlineCache = FakeCategoryDao(listOf(oldCategory))
        val offlineTimeline = FakeTimelineDao(initialActivities = listOf(oldActivity))
        val offlineApi = FakeApi(status = SyncCallResult.Failure(SyncFailureKind.CONNECTION, "Offline."))

        val offline = repository(offlineCache, offlineApi, timeline = offlineTimeline).syncUploadOnly(endpoint)

        assertTrue(offline is SyncOutcome.Failed)
        assertEquals(listOf(oldCategory), offlineCache.rows)
        assertEquals(listOf(oldActivity), offlineTimeline.activityRows)
        assertTrue(offlineApi.exchangeBodies.isEmpty())

        val malformedCache = FakeCategoryDao(listOf(oldCategory))
        val malformedTimeline = FakeTimelineDao(initialActivities = listOf(oldActivity))
        val malformedApi = FakeApi(
            categories = expectedCategories,
            rawActivities = listOf(mapOf("activityId" to "bad")),
        )
        val malformed = repository(malformedCache, malformedApi, timeline = malformedTimeline).syncUploadOnly(endpoint)

        assertTrue(malformed is SyncOutcome.Failed)
        assertEquals(SyncFailureKind.PROTOCOL, (malformed as SyncOutcome.Failed).kind)
        assertEquals(listOf(oldCategory), malformedCache.rows)
        assertEquals(listOf(oldActivity), malformedTimeline.activityRows)
        assertTrue(malformedApi.exchangeBodies.isEmpty())
    }

    @Test
    fun retriesTheSameRevisionAndCarriesItsCategoryAndSavedActivityIds() = runTest {
        val categories = FakeCategoryDao()
        val api = FakeApi(categories = expectedCategories, failFirstExchange = true)
        val syncDao = FakeSyncDao()
        val repository = repository(
            categories,
            api,
            listOf(event("categorized").copy(categoryId = "first", activityId = "writing")),
            syncDao,
        )

        val firstOutcome = repository.syncUploadOnly(endpoint)
        val firstRequest = SyncJson.asObject(SyncJson.parse(api.exchangeBodies.first()))
        val firstRevision = SyncJson.asObject(SyncJson.asList(firstRequest["entryRevisions"]).single())
        val firstEntry = SyncJson.asObject(firstRevision["entry"])
        assertTrue(firstOutcome is SyncOutcome.Failed)
        assertEquals("first", firstEntry["categoryId"])
        assertEquals("writing", firstEntry["activityId"])

        val retryOutcome = repository.syncUploadOnly(endpoint)
        val retryRequest = SyncJson.asObject(SyncJson.parse(api.exchangeBodies.last()))
        val retryRevision = SyncJson.asObject(SyncJson.asList(retryRequest["entryRevisions"]).single())
        val retryEntry = SyncJson.asObject(retryRevision["entry"])

        assertTrue(retryOutcome is SyncOutcome.Success)
        assertEquals(firstRevision["revisionId"], retryRevision["revisionId"])
        assertEquals("first", retryEntry["categoryId"])
        assertEquals("writing", retryEntry["activityId"])
        assertEquals("first", syncDao.getLatestRevision("categorized")?.categoryId)
        assertEquals("writing", syncDao.getLatestRevision("categorized")?.activityId)
    }

    private fun repository(
        categories: FakeCategoryDao,
        api: FakeApi,
        intervals: List<TimeIntervalEntity> = emptyList(),
        syncDao: FakeSyncDao = FakeSyncDao(),
        timeline: FakeTimelineDao = FakeTimelineDao(intervals),
    ) = SyncRepository(
        timelineDao = timeline,
        categoryDao = categories,
        syncDao = syncDao,
        conflictDao = FakeConflictDao(),
        api = api,
        deviceId = { "android-device" },
        transaction = { block -> block() },
        now = { stamp },
    )

    private class FakeApi(
        private val capabilities: List<String> = listOf("entry-title", "upload-only", "category-metadata", "activity-metadata"),
        categories: List<CategorySnapshotEntity> = emptyList(),
        activities: List<ActivitySnapshotEntity> = emptyList(),
        private val status: SyncCallResult<Map<String, Any?>>? = null,
        private val rawCategories: List<Map<String, Any?>>? = null,
        private val rawActivities: List<Map<String, Any?>>? = null,
        private val failFirstExchange: Boolean = false,
    ) : AndroidSyncApi {
        private val categoryPayload: List<Map<String, Any?>> = rawCategories ?: categories.map {
            mapOf(
                "categoryId" to it.categoryId,
                "name" to it.name,
                "sortOrder" to it.sortOrder,
                "isArchived" to it.isArchived,
            )
        }
        private val activityPayload: List<Map<String, Any?>> = rawActivities ?: activities.map {
            mapOf(
                "activityId" to it.activityId,
                "title" to it.title,
                "categoryId" to it.categoryId,
                "color" to it.color,
                "sortOrder" to it.sortOrder,
                "isArchived" to it.isArchived,
            )
        }
        val exchangeBodies = mutableListOf<String>()

        override suspend fun getStatus(endpoint: DesktopEndpoint): SyncCallResult<Map<String, Any?>> = status
            ?: SyncCallResult.Ok(
                mapOf(
                    "protocolVersion" to 1,
                    "capabilities" to capabilities,
                    "categories" to categoryPayload,
                    "activities" to activityPayload,
                ),
            )

        override suspend fun postExchange(
            endpoint: DesktopEndpoint,
            requestJson: String,
        ): SyncCallResult<Map<String, Any?>> {
            exchangeBodies.add(requestJson)
            if (failFirstExchange && exchangeBodies.size == 1) {
                return SyncCallResult.Failure(SyncFailureKind.CONNECTION, "Offline.")
            }
            val request = SyncJson.asObject(SyncJson.parse(requestJson))
            val accepted = SyncJson.asList(request["entryRevisions"]).map {
                SyncJson.asString(SyncJson.asObject(it)["revisionId"]) ?: error("revisionId missing")
            }
            return SyncCallResult.Ok(
                mapOf(
                    "protocolVersion" to 1,
                    "mode" to "UPLOAD_ONLY",
                    "acceptedRevisionIds" to accepted,
                    "acceptedResolutionIds" to emptyList<String>(),
                    "cursor" to null,
                    "hasMore" to false,
                    "entryRevisions" to emptyList<Any>(),
                    "activities" to emptyList<Any>(),
                    "conflicts" to emptyList<Any>(),
                    "resolutions" to emptyList<Any>(),
                ),
            )
        }
    }

    private class FakeCategoryDao(initial: List<CategorySnapshotEntity> = emptyList()) : CategoryDao {
        var rows = initial
            private set

        override fun observeActiveCategories(): Flow<List<CategorySnapshotEntity>> =
            MutableStateFlow(rows.filterNot { it.isArchived })

        override suspend fun getActiveCategory(categoryId: String): CategorySnapshotEntity? =
            rows.firstOrNull { it.categoryId == categoryId && !it.isArchived }

        override suspend fun getAllCategories(): List<CategorySnapshotEntity> = rows
        override suspend fun upsert(category: CategorySnapshotEntity) {
            rows = rows.filterNot { it.categoryId == category.categoryId } + category
        }
        override suspend fun upsert(categories: List<CategorySnapshotEntity>) {
            rows = rows.filterNot { old -> categories.any { it.categoryId == old.categoryId } } + categories
        }
        override suspend fun clearAll() { rows = emptyList() }
    }

    private class FakeTimelineDao(
        initial: List<TimeIntervalEntity> = emptyList(),
        initialActivities: List<ActivitySnapshotEntity> = emptyList(),
    ) : TimelineDao {
        private val rows = initial.toMutableList()
        val activityRows = initialActivities.toMutableList()
        override suspend fun getActiveWorkday(): WorkdayEntity? = null
        override suspend fun getWorkday(workdayId: String): WorkdayEntity? = null
        override fun observeActiveWorkday(): Flow<WorkdayEntity?> = MutableStateFlow(null)
        override fun observeWorkdays(): Flow<List<WorkdayEntity>> = MutableStateFlow(emptyList())
        override suspend fun getIntervals(workdayId: String): List<TimeIntervalEntity> = emptyList()
        override fun observeTimeline(): Flow<List<TimeIntervalEntity>> = MutableStateFlow(rows)
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = MutableStateFlow(rows)
        override fun observeTitleSuggestions(): Flow<List<String>> = MutableStateFlow(emptyList())
        override suspend fun getRunningInterval(): TimeIntervalEntity? = null
        override suspend fun getOpenInterval(workdayId: String): TimeIntervalEntity? = null
        override suspend fun getInterval(entryId: String): TimeIntervalEntity? = rows.firstOrNull { it.entryId == entryId }
        override suspend fun getAllIntervals(): List<TimeIntervalEntity> = rows.toList()
        override suspend fun getAllStoredIntervalIds(): List<String> = rows.map { it.entryId }
        override suspend fun getSyncedEntryIds(): List<String> = emptyList()
        override suspend fun markSynced(entryId: String, revisionId: String, syncedAt: Long) = Unit
        override suspend fun deleteInterval(entryId: String) { rows.removeAll { it.entryId == entryId } }
        override suspend fun deleteIntervals(entryIds: List<String>): Int {
            val before = rows.size
            rows.removeAll { it.entryId in entryIds }
            return before - rows.size
        }
        override suspend fun deleteSyncedIntervals() = Unit
        override suspend fun getOpenIntervalForWorkday(workdayId: String): TimeIntervalEntity? = null
        override suspend fun insertWorkday(workday: WorkdayEntity) = Unit
        override suspend fun insertInterval(interval: TimeIntervalEntity) { rows.add(interval) }
        override suspend fun putInterval(interval: TimeIntervalEntity) = Unit
        override suspend fun putWorkday(workday: WorkdayEntity) = Unit
        override suspend fun updateWorkday(workday: WorkdayEntity) = Unit
        override suspend fun putActivity(activity: ActivitySnapshotEntity) {
            activityRows.removeAll { it.activityId == activity.activityId }
            activityRows.add(activity)
        }
        override suspend fun clearActivities() { activityRows.clear() }
        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = MutableStateFlow(activityRows.filterNot { it.isArchived })
        override suspend fun getActivity(activityId: String): ActivitySnapshotEntity? =
            activityRows.firstOrNull { it.activityId == activityId }
    }

    private class FakeSyncDao : SyncDao {
        private val revisions = mutableListOf<EntryRevisionEntity>()
        override suspend fun putDevice(device: SyncDeviceEntity) = Unit
        override suspend fun getDevice(deviceId: String): SyncDeviceEntity? = null
        override suspend fun insertRevision(revision: EntryRevisionEntity): Long {
            revisions.add(revision)
            return 1L
        }
        override suspend fun getPendingRevisions(): List<EntryRevisionEntity> = revisions.filterNot { it.acknowledged }
        override suspend fun getPendingCount(): Int = revisions.count { !it.acknowledged }
        override suspend fun markAcknowledged(revisionIds: List<String>) = Unit
        override suspend fun getLatestRevision(entryId: String): EntryRevisionEntity? =
            revisions.filter { it.entryId == entryId }.maxByOrNull { it.createdAt }
        override suspend fun deleteRevisionsForEntry(entryId: String) = Unit
        override suspend fun deleteRevisionsForEntries(entryIds: List<String>) = Unit
        override suspend fun putCursor(cursor: SyncCursorEntity) = Unit
        override suspend fun getCursor(): SyncCursorEntity? = null
        override fun observeCursor(): Flow<SyncCursorEntity?> = MutableStateFlow(null)
    }

    private class FakeConflictDao : ConflictDao {
        override suspend fun putConflict(conflict: SyncConflictEntity) = Unit
        override suspend fun insertResolution(resolution: ConflictResolutionEntity): Long = 1L
        override suspend fun getConflict(conflictId: String): SyncConflictEntity? = null
        override fun observeConflicts(): Flow<List<SyncConflictEntity>> = MutableStateFlow(emptyList())
        override fun observeVisibleConflicts(): Flow<List<SyncConflictEntity>> = MutableStateFlow(emptyList())
        override suspend fun getVisibleConflicts(): List<SyncConflictEntity> = emptyList()
        override suspend fun getResolutions(conflictId: String): List<ConflictResolutionEntity> = emptyList()
        override suspend fun getPendingResolutions(): List<ConflictResolutionEntity> = emptyList()
        override suspend fun markResolutionsAcknowledged(resolutionIds: List<String>) = Unit
    }

    companion object {
        private fun category(id: String, name: String, sortOrder: Int, archived: Boolean) = CategorySnapshotEntity(
            categoryId = id,
            name = name,
            sortOrder = sortOrder,
            isArchived = archived,
            receivedAt = 1L,
        )

        private fun activity(
            id: String,
            title: String,
            categoryId: String,
            sortOrder: Int,
            archived: Boolean,
        ) = ActivitySnapshotEntity(
            activityId = id,
            title = title,
            categoryId = categoryId,
            color = null,
            sortOrder = sortOrder,
            isArchived = archived,
            snapshotVersion = id,
            receivedAt = 1L,
        )

        private fun event(id: String) = TimeIntervalEntity(
            entryId = id,
            workdayId = null,
            entryType = "WORK",
            activityId = null,
            categoryId = null,
            startedAt = 1_000L,
            endedAt = 2_000L,
            timeZoneId = "UTC",
            timeZoneOffsetMinutes = 0,
            confirmationState = "CONFIRMED",
            sourceDeviceId = "android-device",
            updatedAt = 2_000L,
            title = "Pending",
        )
    }
}
