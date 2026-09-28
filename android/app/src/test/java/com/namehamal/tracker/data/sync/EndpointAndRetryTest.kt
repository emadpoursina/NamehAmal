package com.namehamal.tracker.data.sync

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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
import java.io.File
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** Endpoint validation, saved-endpoint reuse/forget, explicit-only calls, paging atomicity, failure preservation (T023). */
@OptIn(ExperimentalCoroutinesApi::class)
class EndpointAndRetryTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    // region endpoint validation

    @Test
    fun acceptsPrivateIpLiteralsAndFullPortRange() {
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("192.168.1.20", 3061))
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("10.0.2.2", 1))
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("172.16.0.5", 65535))
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("172.31.255.1", 3061))
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("127.0.0.1", 3060))
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("::1", 3061))
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("macbook.local", 3061))
        // Saving works offline; address safety is checked when the app connects.
        assertTrue(SavedDesktopEndpoint.isValidEndpoint("8.8.8.8", 3061))
    }

    @Test
    fun rejectsMalformedHostsAndOutOfRangePorts() {
        assertFalse(SavedDesktopEndpoint.isValidEndpoint("192.168.1.1", 0))
        assertFalse(SavedDesktopEndpoint.isValidEndpoint("192.168.1.1", 65536))
        assertFalse(SavedDesktopEndpoint.isValidEndpoint("999.1.1.1", 3061))
        assertFalse(SavedDesktopEndpoint.isValidEndpoint("", 3061))
        assertFalse(SavedDesktopEndpoint.isValidEndpoint("http://macbook.local", 3061))
        assertFalse(SavedDesktopEndpoint.isValidEndpoint("-invalid.local", 3061))
    }

    @Test
    fun resolvedPublicDestinationIsRejectedBeforeHttpRequest() = runTest {
        val api = HttpAndroidSyncApi(
            resolveAddresses = { listOf(java.net.InetAddress.getByName("8.8.8.8")) },
        )
        val result = api.getStatus(DesktopEndpoint("macbook.local", 3061))
        assertTrue(result is SyncCallResult.Failure)
        assertEquals(SyncFailureKind.CONNECTION, (result as SyncCallResult.Failure).kind)
    }

    @Test
    fun rejectsMixedPrivateAndPublicDnsResults() {
        val addresses = listOf(
            java.net.InetAddress.getByName("192.168.1.20"),
            java.net.InetAddress.getByName("8.8.8.8"),
        )
        assertFalse(SavedDesktopEndpoint.isPrivateDestination(addresses))
    }

    @Test
    fun acceptsTailscaleSharedAddressSpaceButNotAdjacentRanges() {
        assertTrue(
            SavedDesktopEndpoint.isPrivateDestination(
                listOf(java.net.InetAddress.getByName("100.110.180.85")),
            ),
        )
        assertTrue(
            SavedDesktopEndpoint.isPrivateDestination(
                listOf(java.net.InetAddress.getByName("100.64.0.0")),
            ),
        )
        assertTrue(
            SavedDesktopEndpoint.isPrivateDestination(
                listOf(java.net.InetAddress.getByName("100.127.255.255")),
            ),
        )
        assertFalse(
            SavedDesktopEndpoint.isPrivateDestination(
                listOf(java.net.InetAddress.getByName("100.63.255.255")),
            ),
        )
        assertFalse(
            SavedDesktopEndpoint.isPrivateDestination(
                listOf(java.net.InetAddress.getByName("100.128.0.0")),
            ),
        )
    }

    // endregion

    // region saved endpoint reuse / forgetting

    private fun endpointStore(): SavedDesktopEndpoint {
        val file = File(temporaryFolder.newFolder(), "endpoint.preferences_pb")
        val dataStore = PreferenceDataStoreFactory.create { file }
        return SavedDesktopEndpoint(dataStore)
    }

    @Test
    fun savedEndpointIsReusedAndForgetClearsOnlyThisApp() = runTest {
        val store = endpointStore()
        assertNull(store.endpoint.first())
        assertNull(store.save("192.168.1.20", 3061))
        assertEquals(DesktopEndpoint("192.168.1.20", 3061), store.endpoint.first())
        // Invalid saves never overwrite the good endpoint.
        assertNotNull(store.save("not a hostname", 3061))
        assertEquals(DesktopEndpoint("192.168.1.20", 3061), store.endpoint.first())
        assertNull(store.save("macbook.local", 3061))
        assertEquals(DesktopEndpoint("macbook.local", 3061), store.endpoint.first())
        store.forget()
        assertNull(store.endpoint.first())
    }

    // endregion

    // region sync repository behavior with fakes

    private class FakeTimelineDao(var intervals: MutableList<TimeIntervalEntity> = mutableListOf()) : TimelineDao {
        val activities = mutableListOf<ActivitySnapshotEntity>()
        override suspend fun getActiveWorkday(): WorkdayEntity? = null
        override suspend fun getWorkday(workdayId: String): WorkdayEntity? = null
        override fun observeActiveWorkday(): Flow<WorkdayEntity?> = MutableStateFlow(null)
        override fun observeWorkdays(): Flow<List<WorkdayEntity>> = MutableStateFlow(emptyList())
        override suspend fun getIntervals(workdayId: String): List<TimeIntervalEntity> =
            intervals.filter { it.workdayId == workdayId }
        override fun observeTimeline(): Flow<List<TimeIntervalEntity>> = MutableStateFlow(intervals)
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = MutableStateFlow(intervals)
        override fun observeTitleSuggestions(): Flow<List<String>> = MutableStateFlow(
            intervals.map { it.title }.filter { it.isNotBlank() }.distinct(),
        )
        override suspend fun getRunningInterval(): TimeIntervalEntity? =
            intervals.firstOrNull { it.endedAt == null && it.deletedAt == null }
        override suspend fun getOpenInterval(workdayId: String): TimeIntervalEntity? =
            intervals.firstOrNull { it.workdayId == workdayId && it.endedAt == null }
        override suspend fun getInterval(entryId: String): TimeIntervalEntity? =
            intervals.firstOrNull { it.entryId == entryId }
        override suspend fun getOpenIntervalForWorkday(workdayId: String): TimeIntervalEntity? =
            getOpenInterval(workdayId)
        override suspend fun getAllIntervals(): List<TimeIntervalEntity> = intervals.toList()
        override suspend fun getAllStoredIntervalIds(): List<String> = intervals.map { it.entryId }
        override suspend fun getSyncedEntryIds(): List<String> =
            intervals.filter { it.syncedAt != null && it.deletedAt == null }.map { it.entryId }
        override suspend fun markSynced(entryId: String, revisionId: String, syncedAt: Long) {
            intervals.replaceAll {
                if (it.entryId == entryId) it.copy(currentRevisionId = revisionId, syncedAt = syncedAt) else it
            }
        }
        override suspend fun deleteInterval(entryId: String) {
            intervals.removeAll { it.entryId == entryId }
        }
        override suspend fun deleteIntervals(entryIds: List<String>): Int {
            val before = intervals.size
            intervals.removeAll { it.entryId in entryIds }
            return before - intervals.size
        }
        override suspend fun deleteSyncedIntervals() {
            intervals.removeAll { it.syncedAt != null }
        }
        override suspend fun insertWorkday(workday: WorkdayEntity) = Unit
        override suspend fun insertInterval(interval: TimeIntervalEntity) {
            intervals.add(interval)
        }
        override suspend fun putInterval(interval: TimeIntervalEntity) {
            intervals.removeAll { it.entryId == interval.entryId }
            intervals.add(interval)
        }
        override suspend fun putWorkday(workday: WorkdayEntity) = Unit
        override suspend fun updateWorkday(workday: WorkdayEntity) = Unit
        override suspend fun putActivity(activity: ActivitySnapshotEntity) {
            activities.removeAll { it.activityId == activity.activityId }
            activities.add(activity)
        }
        override suspend fun clearActivities() { activities.clear() }
        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = MutableStateFlow(activities)
        override suspend fun getActivity(activityId: String): ActivitySnapshotEntity? =
            activities.firstOrNull { it.activityId == activityId }
    }

    private class FakeSyncDao : SyncDao {
        val revisions = mutableListOf<EntryRevisionEntity>()
        var cursor: String? = null
        val devices = mutableListOf<SyncDeviceEntity>()
        override suspend fun putDevice(device: SyncDeviceEntity) {
            devices.removeAll { it.deviceId == device.deviceId }
            devices.add(device)
        }
        override suspend fun getDevice(deviceId: String): SyncDeviceEntity? =
            devices.firstOrNull { it.deviceId == deviceId }
        override suspend fun insertRevision(revision: EntryRevisionEntity): Long {
            if (revisions.any { it.revisionId == revision.revisionId }) return -1
            revisions.add(revision)
            return 1
        }
        override suspend fun getPendingRevisions(): List<EntryRevisionEntity> =
            revisions.filter { !it.acknowledged }
        override suspend fun getPendingCount(): Int = revisions.count { !it.acknowledged }
        override suspend fun markAcknowledged(revisionIds: List<String>) {
            revisions.replaceAll { if (revisionIds.contains(it.revisionId)) it.copy(acknowledged = true) else it }
        }
        override suspend fun getLatestRevision(entryId: String): EntryRevisionEntity? =
            revisions.filter { it.entryId == entryId }.maxByOrNull { it.createdAt }
        override suspend fun deleteRevisionsForEntry(entryId: String) {
            revisions.removeAll { it.entryId == entryId }
        }
        override suspend fun deleteRevisionsForEntries(entryIds: List<String>) {
            revisions.removeAll { entryIds.contains(it.entryId) }
        }
        override suspend fun putCursor(cursor: SyncCursorEntity) {
            this.cursor = cursor.cursor
        }
        override suspend fun getCursor(): SyncCursorEntity? =
            cursor?.let { SyncCursorEntity(cursor = it) }
        override fun observeCursor(): Flow<SyncCursorEntity?> =
            MutableStateFlow(cursor?.let { SyncCursorEntity(cursor = it) })
    }

    private class FakeConflictDao : ConflictDao {
        val conflicts = mutableListOf<SyncConflictEntity>()
        val resolutions = mutableListOf<ConflictResolutionEntity>()
        override suspend fun putConflict(conflict: SyncConflictEntity) {
            conflicts.removeAll { it.conflictId == conflict.conflictId }
            conflicts.add(conflict)
        }
        override suspend fun insertResolution(resolution: ConflictResolutionEntity): Long {
            if (resolutions.any { it.resolutionId == resolution.resolutionId }) return -1
            resolutions.add(resolution)
            return 1
        }
        override suspend fun getConflict(conflictId: String): SyncConflictEntity? =
            conflicts.firstOrNull { it.conflictId == conflictId }
        override fun observeConflicts(): Flow<List<SyncConflictEntity>> = MutableStateFlow(conflicts)
        override fun observeVisibleConflicts(): Flow<List<SyncConflictEntity>> =
            MutableStateFlow(conflicts.filter { it.state != "RESOLVED" })
        override suspend fun getVisibleConflicts(): List<SyncConflictEntity> =
            conflicts.filter { it.state != "RESOLVED" }
        override suspend fun getResolutions(conflictId: String): List<ConflictResolutionEntity> =
            resolutions.filter { it.conflictId == conflictId }
        override suspend fun getPendingResolutions(): List<ConflictResolutionEntity> =
            resolutions.filter { !it.acknowledged }
        override suspend fun markResolutionsAcknowledged(resolutionIds: List<String>) {
            resolutions.replaceAll { if (resolutionIds.contains(it.resolutionId)) it.copy(acknowledged = true) else it }
        }
    }

    private class FakeCategoryDao : CategoryDao {
        private val rows = mutableListOf<CategorySnapshotEntity>()
        override fun observeActiveCategories(): Flow<List<CategorySnapshotEntity>> =
            MutableStateFlow(rows.filterNot { it.isArchived })
        override suspend fun getActiveCategory(categoryId: String): CategorySnapshotEntity? =
            rows.firstOrNull { it.categoryId == categoryId && !it.isArchived }
        override suspend fun getAllCategories(): List<CategorySnapshotEntity> = rows.toList()
        override suspend fun upsert(category: CategorySnapshotEntity) {
            rows.removeAll { it.categoryId == category.categoryId }
            rows.add(category)
        }
        override suspend fun upsert(categories: List<CategorySnapshotEntity>) {
            rows.removeAll { old -> categories.any { it.categoryId == old.categoryId } }
            rows.addAll(categories)
        }
        override suspend fun clearAll() { rows.clear() }
    }

    private class FakeApi(
        var status: SyncCallResult<Map<String, Any?>> =
            SyncCallResult.Ok(mapOf("protocolVersion" to 1, "desktopDeviceId" to "desktop", "syncEnabled" to true)),
        val exchanges: ArrayDeque<SyncCallResult<Map<String, Any?>>> = ArrayDeque(),
        /** When true, scripted success responses echo the uploaded ids as accepted. */
        var echoAcceptedIds: Boolean = false,
    ) : AndroidSyncApi {
        var statusCalls = 0
        var exchangeCalls = 0
        val exchangeBodies = mutableListOf<String>()
        override suspend fun getStatus(endpoint: DesktopEndpoint): SyncCallResult<Map<String, Any?>> {
            statusCalls += 1
            return status
        }
        override suspend fun postExchange(
            endpoint: DesktopEndpoint,
            requestJson: String,
        ): SyncCallResult<Map<String, Any?>> {
            exchangeCalls += 1
            exchangeBodies.add(requestJson)
            val scripted = exchanges.removeFirstOrNull()
                ?: return SyncCallResult.Failure(SyncFailureKind.CONNECTION, "No scripted response.")
            if (!echoAcceptedIds) return scripted
            val ok = (scripted as? SyncCallResult.Ok)?.value ?: return scripted
            val requested = SyncJson.asObject(SyncJson.parse(requestJson))
            fun ids(key: String): List<Any?> =
                SyncJson.asList(requested[key]).mapNotNull {
                    (SyncJson.asObject(it)[if (key == "entryRevisions") "revisionId" else "resolutionId"] as? String)
                }
            return SyncCallResult.Ok(
                ok.toMutableMap().apply {
                    put("acceptedRevisionIds", ids("entryRevisions"))
                    put("acceptedResolutionIds", ids("resolutions"))
                },
            )
        }
    }

    private fun emptyExchange(cursor: String = "cursor-1"): Map<String, Any?> = mapOf(
        "protocolVersion" to 1,
        "acceptedRevisionIds" to emptyList<Any>(),
        "acceptedResolutionIds" to emptyList<Any>(),
        "cursor" to cursor,
        "hasMore" to false,
        "entryRevisions" to emptyList<Any>(),
        "activities" to emptyList<Any>(),
        "conflicts" to emptyList<Any>(),
        "resolutions" to emptyList<Any>(),
    )

    private fun repository(
        timeline: FakeTimelineDao = FakeTimelineDao(),
        sync: FakeSyncDao = FakeSyncDao(),
        conflicts: FakeConflictDao = FakeConflictDao(),
        api: FakeApi = FakeApi(),
    ) = SyncRepository(
        timelineDao = timeline,
        categoryDao = FakeCategoryDao(),
        syncDao = sync,
        conflictDao = conflicts,
        api = api,
        deviceId = { "android-device" },
        transaction = { block -> block() },
    )

    private fun interval(entryId: String) = TimeIntervalEntity(
        entryId = entryId,
        workdayId = "workday-1",
        entryType = "WORK",
        activityId = null,
        startedAt = 1_700_000_000_000L,
        endedAt = 1_700_000_360_000L,
        timeZoneId = "Asia/Yerevan",
        timeZoneOffsetMinutes = 240,
        confirmationState = "CONFIRMED",
        sourceDeviceId = "android-device",
        updatedAt = 1_700_000_360_000L,
    )

    @Test
    fun makesNoNetworkCallsUntilSyncStarts() = runTest {
        val api = FakeApi()
        repository(api = api)
        assertEquals(0, api.statusCalls)
        assertEquals(0, api.exchangeCalls)
    }

    @Test
    fun failedSyncPreservesEntriesRevisionsAndCursor() = runTest {
        val timeline = FakeTimelineDao(mutableListOf(interval("entry-1")))
        val sync = FakeSyncDao()
        val api = FakeApi(
            exchanges = ArrayDeque(
                listOf(SyncCallResult.Failure(SyncFailureKind.CONNECTION, "Offline.")),
            ),
        )
        val outcome = repository(timeline, sync, FakeConflictDao(), api).sync(DesktopEndpoint("192.168.1.20", 3061))
        assertTrue(outcome is SyncOutcome.Failed)
        // Local entries, pending revisions, and cursor are untouched.
        assertEquals(1, timeline.intervals.size)
        assertEquals(1, sync.getPendingRevisions().size)
        assertNull(sync.getCursor()?.cursor)
        assertEquals(1, api.exchangeCalls)
    }

    @Test
    fun multiPageSyncAppliesAtomicallyAndAdvancesCursorOnce() = runTest {
        val timeline = FakeTimelineDao(mutableListOf(interval("entry-1")))
        val sync = FakeSyncDao()
        val page1 = emptyExchange("cursor-1").toMutableMap()
        page1["hasMore"] = true
        val api = FakeApi(
            exchanges = ArrayDeque(
                listOf(
                    SyncCallResult.Ok(page1),
                    SyncCallResult.Ok(emptyExchange("cursor-2")),
                ),
            ),
            echoAcceptedIds = true,
        )
        val outcome = repository(timeline, sync, FakeConflictDao(), api).sync(DesktopEndpoint("192.168.1.20", 3061))
        assertTrue(outcome is SyncOutcome.Success)
        assertEquals(2, (outcome as SyncOutcome.Success).pages)
        assertEquals("cursor-2", sync.getCursor()?.cursor)
        assertEquals(0, sync.getPendingRevisions().size)
    }

    @Test
    fun permissionDenialFailsSafelyWithoutLosingData() = runTest {
        val timeline = FakeTimelineDao(mutableListOf(interval("entry-1")))
        val sync = FakeSyncDao()
        // Local-network permission denial surfaces as a connection failure.
        val api = FakeApi(
            status = SyncCallResult.Failure(SyncFailureKind.CONNECTION, "Local network denied."),
        )
        val outcome = repository(timeline, sync, FakeConflictDao(), api).sync(DesktopEndpoint("192.168.1.20", 3061))
        assertTrue(outcome is SyncOutcome.Failed)
        assertEquals(1, timeline.intervals.size)
        assertNull(sync.getCursor()?.cursor)
        assertEquals(0, api.exchangeCalls)
    }

    // endregion
}

private fun <T> MutableList<T>.replaceAll(transform: (T) -> T) {
    for (index in indices) set(index, transform(get(index)))
}
