package com.namehamal.tracker.data.sync

import com.namehamal.tracker.data.local.ActivitySnapshotEntity
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UploadOnlySyncTest {
    private val endpoint = DesktopEndpoint("macbook.local", 3061)
    private val stamp = Instant.parse("2026-09-27T12:00:00Z").toEpochMilli()

    @Test
    fun requiresTitleAndUploadCapabilitiesBeforeSendingAnything() = runTest {
        val timeline = FakeTimelineDao(mutableListOf(event("event-1", "Planning", endedAt = stamp)))
        val sync = FakeSyncDao()
        val api = FakeApi(capabilities = listOf("entry-title"))
        val outcome = repository(timeline, sync, api).syncUploadOnly(endpoint)

        assertTrue(outcome is SyncOutcome.Failed)
        assertEquals(SyncFailureKind.VERSION, (outcome as SyncOutcome.Failed).kind)
        assertEquals(0, api.exchangeBodies.size)
        assertTrue(sync.revisions.isEmpty())
        assertNull(timeline.intervals.single().syncedAt)
    }

    @Test
    fun uploadsOnlyCompletedTitledEventsAndMarksOnlyAcceptedRevisionsSynced() = runTest {
        val timeline = FakeTimelineDao(
            mutableListOf(
                event("completed-1", "Planning", endedAt = stamp),
                event("completed-2", "Writing", endedAt = stamp - 1_000),
                event("running", "Still working", endedAt = null),
                event("blank", "   ", endedAt = stamp - 2_000),
                event("deleted", "Removed", endedAt = stamp - 3_000, deletedAt = stamp),
            ),
        )
        val sync = FakeSyncDao()
        val api = FakeApi(acceptedRevisionCount = 1)
        val outcome = repository(timeline, sync, api).syncUploadOnly(endpoint)
        val request = SyncJson.asObject(SyncJson.parse(api.exchangeBodies.single()))
        val sent = SyncJson.asList(request["entryRevisions"]).map { SyncJson.asObject(it) }
        val sentEntries = sent.map { SyncJson.asObject(it["entry"]) }

        assertTrue(outcome is SyncOutcome.Success)
        assertEquals(1, (outcome as SyncOutcome.Success).uploadedRevisions)
        assertEquals(0, outcome.downloadedRevisions)
        assertEquals("UPLOAD_ONLY", request["mode"])
        assertEquals(emptyList<Any>(), request["resolutions"])
        assertEquals(listOf("Planning", "Writing"), sentEntries.map { it["title"] })
        assertTrue(sentEntries.all { it["endedAt"] is String && it["deletedAt"] == null })

        assertTrue(timeline.intervals.first { it.entryId == "completed-1" }.syncedAt != null)
        assertNull(timeline.intervals.first { it.entryId == "completed-2" }.syncedAt)
        assertNull(timeline.intervals.first { it.entryId == "running" }.syncedAt)
        assertNull(timeline.intervals.first { it.entryId == "blank" }.syncedAt)
        assertEquals(1, sync.getPendingCount())
        assertFalse(sync.revisions.any { it.entryId == "deleted" })
    }

    @Test
    fun failedAttemptRetriesTheSameRevisionIdAndLeavesEventPendingUntilAck() = runTest {
        val timeline = FakeTimelineDao(mutableListOf(event("retry-me", "Retry me", endedAt = stamp)))
        val sync = FakeSyncDao()
        val api = FakeApi(failFirstExchange = true)
        val repo = repository(timeline, sync, api)

        val first = repo.syncUploadOnly(endpoint)
        val firstId = revisionIds(api.exchangeBodies.first()).single()
        assertTrue(first is SyncOutcome.Failed)
        assertNull(timeline.intervals.single().syncedAt)
        assertEquals(1, sync.getPendingCount())

        val second = repo.syncUploadOnly(endpoint)
        val secondId = revisionIds(api.exchangeBodies.last()).single()
        assertTrue(second is SyncOutcome.Success)
        assertEquals(firstId, secondId)
        assertTrue(timeline.intervals.single().syncedAt != null)
        assertEquals(1, sync.revisions.size)
    }

    @Test
    fun hostDeltaInUploadOnlyReplyIsRejectedWithoutAcknowledgingAnything() = runTest {
        val timeline = FakeTimelineDao(mutableListOf(event("event-1", "Planning", endedAt = stamp)))
        val sync = FakeSyncDao()
        val api = FakeApi(returnHostRevision = true)
        val outcome = repository(timeline, sync, api).syncUploadOnly(endpoint)

        assertTrue(outcome is SyncOutcome.Failed)
        assertEquals(SyncFailureKind.PROTOCOL, (outcome as SyncOutcome.Failed).kind)
        assertNull(timeline.intervals.single().syncedAt)
        assertEquals(1, sync.getPendingCount())
    }

    private fun repository(timeline: FakeTimelineDao, sync: FakeSyncDao, api: FakeApi) = SyncRepository(
        timelineDao = timeline,
        syncDao = sync,
        conflictDao = FakeConflictDao(),
        api = api,
        deviceId = { "android-device" },
        transaction = { block -> block() },
        now = { stamp },
    )

    private fun revisionIds(body: String): List<String> = SyncJson.asList(
        SyncJson.asObject(SyncJson.parse(body))["entryRevisions"],
    ).map { SyncJson.asString(SyncJson.asObject(it)["revisionId"]) ?: error("revisionId missing") }

    private class FakeApi(
        private val capabilities: List<String> = listOf("entry-title", "upload-only"),
        private val acceptedRevisionCount: Int = Int.MAX_VALUE,
        private val failFirstExchange: Boolean = false,
        private val returnHostRevision: Boolean = false,
    ) : AndroidSyncApi {
        val exchangeBodies = mutableListOf<String>()
        override suspend fun getStatus(endpoint: DesktopEndpoint): SyncCallResult<Map<String, Any?>> =
            SyncCallResult.Ok(mapOf("protocolVersion" to 1, "capabilities" to capabilities))

        override suspend fun postExchange(
            endpoint: DesktopEndpoint,
            requestJson: String,
        ): SyncCallResult<Map<String, Any?>> {
            exchangeBodies.add(requestJson)
            if (failFirstExchange && exchangeBodies.size == 1) {
                return SyncCallResult.Failure(SyncFailureKind.CONNECTION, "Offline.")
            }
            val request = SyncJson.asObject(SyncJson.parse(requestJson))
            val revisions = SyncJson.asList(request["entryRevisions"])
                .map { SyncJson.asString(SyncJson.asObject(it)["revisionId"]) }
            val accepted = revisions.take(acceptedRevisionCount)
            val response = mutableMapOf<String, Any?>(
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
            )
            if (returnHostRevision) response["entryRevisions"] = listOf(mapOf("host" to "delta"))
            return SyncCallResult.Ok(response)
        }
    }

    private class FakeTimelineDao(val intervals: MutableList<TimeIntervalEntity>) : TimelineDao {
        override suspend fun getActiveWorkday(): WorkdayEntity? = null
        override suspend fun getWorkday(workdayId: String): WorkdayEntity? = null
        override fun observeActiveWorkday(): Flow<WorkdayEntity?> = MutableStateFlow(null)
        override fun observeWorkdays(): Flow<List<WorkdayEntity>> = MutableStateFlow(emptyList())
        override suspend fun getIntervals(workdayId: String): List<TimeIntervalEntity> = emptyList()
        override fun observeTimeline(): Flow<List<TimeIntervalEntity>> = MutableStateFlow(intervals)
        override fun observeEvents(): Flow<List<TimeIntervalEntity>> = MutableStateFlow(intervals)
        override fun observeTitleSuggestions(): Flow<List<String>> = MutableStateFlow(emptyList())
        override suspend fun getRunningInterval(): TimeIntervalEntity? = intervals.firstOrNull { it.endedAt == null }
        override suspend fun getOpenInterval(workdayId: String): TimeIntervalEntity? = null
        override suspend fun getInterval(entryId: String): TimeIntervalEntity? = intervals.firstOrNull { it.entryId == entryId }
        override suspend fun getAllIntervals(): List<TimeIntervalEntity> = intervals.toList()
        override suspend fun getSyncedEntryIds(): List<String> = intervals.filter { it.syncedAt != null }.map { it.entryId }
        override suspend fun markSynced(entryId: String, revisionId: String, syncedAt: Long) {
            intervals.replaceAll { if (it.entryId == entryId) it.copy(currentRevisionId = revisionId, syncedAt = syncedAt) else it }
        }
        override suspend fun deleteInterval(entryId: String) { intervals.removeAll { it.entryId == entryId } }
        override suspend fun deleteSyncedIntervals() { intervals.removeAll { it.syncedAt != null } }
        override suspend fun getOpenIntervalForWorkday(workdayId: String): TimeIntervalEntity? = null
        override suspend fun insertWorkday(workday: WorkdayEntity) = Unit
        override suspend fun insertInterval(interval: TimeIntervalEntity) { intervals.add(interval) }
        override suspend fun putInterval(interval: TimeIntervalEntity) { intervals.replaceAll { if (it.entryId == interval.entryId) interval else it } }
        override suspend fun putWorkday(workday: WorkdayEntity) = Unit
        override suspend fun updateWorkday(workday: WorkdayEntity) = Unit
        override suspend fun putActivity(activity: ActivitySnapshotEntity) = Unit
        override fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = MutableStateFlow(emptyList())
        override suspend fun getActivity(activityId: String): ActivitySnapshotEntity? = null
    }

    private class FakeSyncDao : SyncDao {
        val revisions = mutableListOf<EntryRevisionEntity>()
        override suspend fun putDevice(device: SyncDeviceEntity) = Unit
        override suspend fun getDevice(deviceId: String): SyncDeviceEntity? = null
        override suspend fun insertRevision(revision: EntryRevisionEntity): Long {
            if (revisions.any { it.revisionId == revision.revisionId }) return -1
            revisions.add(revision)
            return 1
        }
        override suspend fun getPendingRevisions(): List<EntryRevisionEntity> = revisions.filterNot { it.acknowledged }
        override suspend fun getPendingCount(): Int = revisions.count { !it.acknowledged }
        override suspend fun markAcknowledged(revisionIds: List<String>) {
            revisions.replaceAll { if (it.revisionId in revisionIds) it.copy(acknowledged = true) else it }
        }
        override suspend fun getLatestRevision(entryId: String): EntryRevisionEntity? =
            revisions.filter { it.entryId == entryId }.maxByOrNull { it.createdAt }
        override suspend fun deleteRevisionsForEntry(entryId: String) { revisions.removeAll { it.entryId == entryId } }
        override suspend fun deleteRevisionsForEntries(entryIds: List<String>) { revisions.removeAll { it.entryId in entryIds } }
        override suspend fun putCursor(cursor: SyncCursorEntity) = Unit
        override suspend fun getCursor(): SyncCursorEntity? = null
        override fun observeCursor(): Flow<SyncCursorEntity?> = MutableStateFlow(null)
    }

    private class FakeConflictDao : ConflictDao {
        override suspend fun putConflict(conflict: SyncConflictEntity) = Unit
        override suspend fun insertResolution(resolution: ConflictResolutionEntity): Long = 1
        override suspend fun getConflict(conflictId: String): SyncConflictEntity? = null
        override fun observeConflicts(): Flow<List<SyncConflictEntity>> = MutableStateFlow(emptyList())
        override fun observeVisibleConflicts(): Flow<List<SyncConflictEntity>> = MutableStateFlow(emptyList())
        override suspend fun getVisibleConflicts(): List<SyncConflictEntity> = emptyList()
        override suspend fun getResolutions(conflictId: String): List<ConflictResolutionEntity> = emptyList()
        override suspend fun getPendingResolutions(): List<ConflictResolutionEntity> = emptyList()
        override suspend fun markResolutionsAcknowledged(resolutionIds: List<String>) = Unit
    }

    companion object {
        private fun event(
            id: String,
            title: String,
            endedAt: Long?,
            deletedAt: Long? = null,
        ) = TimeIntervalEntity(
            entryId = id,
            workdayId = null,
            entryType = "WORK",
            activityId = null,
            startedAt = endedAt?.minus(3_600_000L) ?: 1_700_000_000_000L,
            endedAt = endedAt,
            timeZoneId = "Asia/Yerevan",
            timeZoneOffsetMinutes = 240,
            confirmationState = "CONFIRMED",
            sourceDeviceId = "android-device",
            updatedAt = endedAt ?: 1_700_000_000_000L,
            deletedAt = deletedAt,
            title = title,
        )
    }
}

private fun <T> MutableList<T>.replaceAll(transform: (T) -> T) {
    for (index in indices) set(index, transform(get(index)))
}
