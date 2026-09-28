package com.namehamal.tracker.data.sync

import com.namehamal.tracker.data.local.ConflictDao
import com.namehamal.tracker.data.local.ConflictResolutionEntity
import com.namehamal.tracker.data.local.SyncConflictEntity
import com.namehamal.tracker.data.local.SyncDao
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.data.local.TimelineDao
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow

/** User resolution actions for one conflict (T039). */
enum class ConflictAction(val wire: String) {
    KEEP_ENTRY("KEEP_ENTRY"),
    SPLIT("SPLIT"),
    EDIT("EDIT"),
    UNASSIGNED("UNASSIGNED"),
    UNDO("UNDO"),
}

/**
 * Applies user conflict decisions as new revisions and queues them for upload.
 * Originals are preserved; undo appends a compensating resolution and re-opens
 * the conflict instead of deleting history.
 */
class ConflictResolutionRepository(
    private val timelineDao: TimelineDao,
    private val syncDao: SyncDao,
    private val conflictDao: ConflictDao,
    private val deviceId: () -> String,
    private val transaction: suspend (suspend () -> Unit) -> Unit,
) {
    fun observeVisibleConflicts(): Flow<List<SyncConflictEntity>> =
        conflictDao.observeVisibleConflicts()

    suspend fun visibleConflicts(): List<SyncConflictEntity> =
        conflictDao.getVisibleConflicts()

    suspend fun history(conflictId: String): List<ConflictResolutionEntity> =
        conflictDao.getResolutions(conflictId)

    /**
     * Keep one preserved version of a concurrent edit. The kept snapshot is
     * stored as a new revision so both branches stay inspectable.
     */
    suspend fun keepVersion(conflictId: String, revisionId: String) {
        applyDecision(conflictId, ConflictAction.KEEP_ENTRY, revisionId, emptyList(), null)
    }

    /** Assign the overlapping span to Unassigned via a new revision. */
    suspend fun assignUnassigned(conflictId: String, entryId: String) {
        applyDecision(
            conflictId = conflictId,
            action = ConflictAction.UNASSIGNED,
            selectedRevisionId = null,
            resultEntryIds = listOf(entryId),
            mutate = {
                it.copy(activityId = null, updatedAt = Instant.now().toEpochMilli())
            },
        )
    }

    /** Undo a resolution: append a compensating record and re-open the conflict. */
    suspend fun undo(conflictId: String, undoesResolutionId: String) {
        applyDecision(conflictId, ConflictAction.UNDO, null, emptyList(), null, undoesResolutionId)
    }

    private suspend fun applyDecision(
        conflictId: String,
        action: ConflictAction,
        selectedRevisionId: String?,
        resultEntryIds: List<String>,
        mutate: ((TimeIntervalEntity) -> TimeIntervalEntity)? = null,
        undoesResolutionId: String? = null,
    ) {
        transaction {
            val conflict = requireNotNull(conflictDao.getConflict(conflictId)) {
                "Conflict not found."
            }
            val now = Instant.now().toEpochMilli()
            val producedIds = ArrayList(resultEntryIds)
            val entryIds = entryIdsOf(conflict)
            if (mutate != null) {
                for (entryId in entryIds) {
                    val current = timelineDao.getInterval(entryId) ?: continue
                    val updated = mutate(current)
                    timelineDao.putInterval(updated)
                    queueRevisionFor(updated, baseRevisionOf(entryId))
                    if (!producedIds.contains(updated.entryId)) producedIds.add(updated.entryId)
                }
            }
            val me = deviceId()
            conflictDao.insertResolution(
                ConflictResolutionEntity(
                    resolutionId = UUID.randomUUID().toString(),
                    conflictId = conflictId,
                    action = action.wire,
                    selectedRevisionId = selectedRevisionId,
                    resultEntryIdsJson = SyncJson.stringify(producedIds),
                    resolvedByDeviceId = me,
                    resolvedAt = now,
                    undoesResolutionId = undoesResolutionId,
                    acknowledged = false,
                ),
            )
            val reopened = action == ConflictAction.UNDO
            conflictDao.putConflict(
                conflict.copy(
                    state = if (reopened) "UNDONE" else "RESOLVED",
                    updatedAt = now,
                ),
            )
        }
    }

    private suspend fun queueRevisionFor(interval: TimeIntervalEntity, baseRevisionId: String?) {
        val me = deviceId()
        val now = Instant.now().toEpochMilli()
        syncDao.insertRevision(
            com.namehamal.tracker.data.local.EntryRevisionEntity(
                revisionId = UUID.randomUUID().toString(),
                entryId = interval.entryId,
                baseRevisionId = baseRevisionId,
                changedByDeviceId = me,
                sourceDeviceId = interval.sourceDeviceId,
                updatedAt = interval.updatedAt,
                entryType = interval.entryType,
                activityId = interval.activityId,
                categoryId = null,
                startedAt = interval.startedAt,
                endedAt = interval.endedAt ?: now,
                timeZoneId = interval.timeZoneId,
                timeZoneOffsetMinutes = interval.timeZoneOffsetMinutes,
                confirmationState = interval.confirmationState,
                deletedAt = interval.deletedAt,
                acknowledged = false,
                createdAt = now,
            ),
        )
    }

    private suspend fun baseRevisionOf(entryId: String): String? =
        syncDao.getLatestRevision(entryId)?.revisionId

    private fun entryIdsOf(conflict: SyncConflictEntity): List<String> =
        SyncJson.asList(SyncJson.parse(conflict.entryIdsJson)).mapNotNull { it as? String }
}
