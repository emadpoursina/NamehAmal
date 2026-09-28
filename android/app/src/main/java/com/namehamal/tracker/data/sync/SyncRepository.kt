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
import java.time.Instant
import java.util.UUID

/** Outcome of one user-started manual sync. */
sealed interface SyncOutcome {
    data class Success(
        val uploadedRevisions: Int,
        val downloadedRevisions: Int,
        val pages: Int,
    ) : SyncOutcome
    data class Failed(val kind: SyncFailureKind, val message: String) : SyncOutcome
}

/**
 * Room-transactional sync repository. The legacy method retains 004's
 * bidirectional protocol; the simplified app uses syncUploadOnly exclusively.
 */
class SyncRepository(
    private val timelineDao: TimelineDao,
    private val syncDao: SyncDao,
    private val conflictDao: ConflictDao,
    private val api: AndroidSyncApi,
    private val deviceId: () -> String,
    private val transaction: suspend (suspend () -> Unit) -> Unit,
    private val now: () -> Long = { Instant.now().toEpochMilli() },
) {
    suspend fun pendingCount(): Int {
        val localPending = timelineDao.getAllIntervals()
            .filter {
                it.endedAt != null && it.endedAt > it.startedAt &&
                    it.deletedAt == null && it.syncedAt == null && it.title.isNotBlank()
            }
            .mapTo(mutableSetOf()) { it.entryId }
        val revisionPending = syncDao.getPendingRevisions().mapTo(mutableSetOf()) { it.entryId }
        return localPending.union(revisionPending).size + conflictDao.getPendingResolutions().size
    }

    suspend fun currentCursor(): String? = syncDao.getCursor()?.cursor

    /** One manual sync against the saved endpoint. Never called automatically. */
    suspend fun sync(endpoint: DesktopEndpoint): SyncOutcome {
        val me = deviceId()
        when (val status = api.getStatus(endpoint)) {
            is SyncCallResult.Failure -> return SyncOutcome.Failed(status.kind, status.message)
            is SyncCallResult.Ok -> {
                val protocol = (status.value["protocolVersion"] as? Number)?.toInt()
                if (protocol != PROTOCOL_VERSION) {
                    return SyncOutcome.Failed(
                        SyncFailureKind.VERSION,
                        "The desktop needs a compatible app version; nothing was changed.",
                    )
                }
            }
        }

        queueLocalChanges(me)
        var uploaded = 0
        var downloaded = 0
        var pages = 0
        while (pages < MAX_PAGES_PER_SYNC) {
            val cursor = syncDao.getCursor()?.cursor
            val pendingRevisions = syncDao.getPendingRevisions()
            val pendingResolutions = conflictDao.getPendingResolutions()
            val requestJson = buildRequest(me, cursor, pendingRevisions, pendingResolutions)
            val response = when (val call = api.postExchange(endpoint, requestJson)) {
                is SyncCallResult.Failure -> return SyncOutcome.Failed(call.kind, call.message)
                is SyncCallResult.Ok -> call.value
            }
            val parsed: ParsedExchange
            try {
                parsed = parseExchange(response)
            } catch (_: IllegalArgumentException) {
                return SyncOutcome.Failed(
                    SyncFailureKind.PROTOCOL,
                    "The desktop returned an unreadable reply; nothing was changed.",
                )
            }
            try {
                transaction {
                    applyPage(me, parsed, pendingRevisions, pendingResolutions)
                }
            } catch (_: Exception) {
                // Local commit failed: previous cursor kept, everything retryable.
                return SyncOutcome.Failed(
                    SyncFailureKind.HOST,
                    "Sync could not be saved on the phone; nothing was advanced. Retry.",
                )
            }
            uploaded += parsed.acceptedRevisionIds.size
            downloaded += parsed.revisions.size
            pages += 1
            if (!parsed.hasMore) {
                syncDao.putDevice(SyncDeviceEntity(me, "ANDROID", now()))
                return SyncOutcome.Success(uploaded, downloaded, pages)
            }
        }
        return SyncOutcome.Failed(
            SyncFailureKind.PROTOCOL,
            "Sync needs more pages than one manual action allows; tap Sync again to continue.",
        )
    }

    /** Upload the simplified app's completed titled events and receive acknowledgements only. */
    suspend fun syncUploadOnly(endpoint: DesktopEndpoint): SyncOutcome {
        val me = deviceId()
        val status = when (val call = api.getStatus(endpoint)) {
            is SyncCallResult.Failure -> return SyncOutcome.Failed(call.kind, call.message)
            is SyncCallResult.Ok -> call.value
        }
        if ((status["protocolVersion"] as? Number)?.toInt() != PROTOCOL_VERSION) {
            return SyncOutcome.Failed(
                SyncFailureKind.VERSION,
                "The desktop needs a compatible app version; nothing was changed.",
            )
        }
        val capabilities = (status["capabilities"] as? List<*>)?.filterIsInstance<String>().orEmpty()
        if (!capabilities.containsAll(listOf(ENTRY_TITLE_CAPABILITY, UPLOAD_ONLY_CAPABILITY))) {
            return SyncOutcome.Failed(
                SyncFailureKind.VERSION,
                "Update the desktop app to support titled upload-only sync. No event data was sent.",
            )
        }

        val pending = try {
            prepareUploadOnlyRevisions(me)
        } catch (_: Exception) {
            return SyncOutcome.Failed(
                SyncFailureKind.HOST,
                "Could not prepare phone events for sync. Local sessions are unchanged; retry.",
            )
        }
        if (pending.isEmpty()) return SyncOutcome.Success(0, 0, 0)

        val response = when (val call = api.postExchange(endpoint, buildUploadOnlyRequest(me, pending))) {
            is SyncCallResult.Failure -> return SyncOutcome.Failed(call.kind, call.message)
            is SyncCallResult.Ok -> call.value
        }
        val accepted = try {
            parseUploadOnlyAcknowledgements(response).also { ids ->
                require(ids.all { id -> pending.any { it.revisionId == id } }) {
                    "The desktop acknowledged an event that was not sent."
                }
            }
        } catch (_: IllegalArgumentException) {
            return SyncOutcome.Failed(
                SyncFailureKind.PROTOCOL,
                "The desktop returned an invalid upload-only reply. Nothing was marked synced; retry.",
            )
        }
        try {
            transaction {
                syncDao.markAcknowledged(accepted)
                val acceptedRevisions = pending.filter { it.revisionId in accepted }
                for (revision in acceptedRevisions) {
                    timelineDao.markSynced(revision.entryId, revision.revisionId, now())
                }
                syncDao.putDevice(SyncDeviceEntity(me, "ANDROID", now()))
            }
        } catch (_: Exception) {
            return SyncOutcome.Failed(
                SyncFailureKind.HOST,
                "Sync was accepted by the desktop but could not be saved on the phone. Retry safely.",
            )
        }
        return SyncOutcome.Success(accepted.size, 0, 1)
    }

    private suspend fun prepareUploadOnlyRevisions(me: String): List<EntryRevisionEntity> {
        var result: List<EntryRevisionEntity> = emptyList()
        transaction {
            val intervals = timelineDao.getAllIntervals()
            for (interval in intervals) {
                val endedAt = interval.endedAt ?: continue
                val title = interval.title.trim()
                if (interval.deletedAt != null || interval.syncedAt != null || title.isEmpty() || endedAt <= interval.startedAt) {
                    continue
                }
                val latest = syncDao.getLatestRevision(interval.entryId)
                val matches = latest != null &&
                    latest.startedAt == interval.startedAt &&
                    latest.endedAt == endedAt &&
                    latest.entryType == interval.entryType &&
                    latest.activityId == interval.activityId &&
                    latest.timeZoneId == interval.timeZoneId &&
                    latest.timeZoneOffsetMinutes == interval.timeZoneOffsetMinutes &&
                    latest.confirmationState == interval.confirmationState &&
                    latest.deletedAt == null &&
                    latest.title.trim() == title
                if (matches) {
                    if (latest!!.acknowledged) {
                        timelineDao.markSynced(interval.entryId, latest.revisionId, latest.createdAt)
                    }
                    continue
                }
                syncDao.insertRevision(
                    EntryRevisionEntity(
                        revisionId = UUID.randomUUID().toString(),
                        entryId = interval.entryId,
                        baseRevisionId = latest?.revisionId,
                        changedByDeviceId = me,
                        sourceDeviceId = interval.sourceDeviceId,
                        updatedAt = interval.updatedAt,
                        entryType = interval.entryType,
                        activityId = interval.activityId,
                        categoryId = null,
                        startedAt = interval.startedAt,
                        endedAt = endedAt,
                        timeZoneId = interval.timeZoneId,
                        timeZoneOffsetMinutes = interval.timeZoneOffsetMinutes,
                        confirmationState = interval.confirmationState,
                        deletedAt = null,
                        acknowledged = false,
                        createdAt = now(),
                        title = title,
                    ),
                )
            }
            val eligibleIds = timelineDao.getAllIntervals()
                .filter { it.endedAt != null && it.deletedAt == null && it.syncedAt == null && it.title.isNotBlank() }
                .mapTo(mutableSetOf()) { it.entryId }
            result = syncDao.getPendingRevisions()
                .filter { it.entryId in eligibleIds && it.deletedAt == null && it.title.isNotBlank() }
                .take(MAX_UPLOAD_BATCH)
        }
        return result
    }

    private fun buildUploadOnlyRequest(me: String, revisions: List<EntryRevisionEntity>): String {
        val revisionDtos = revisions.map { revision ->
            mapOf(
                "revisionId" to revision.revisionId,
                "entryId" to revision.entryId,
                "baseRevisionId" to revision.baseRevisionId,
                "sourceDeviceId" to revision.sourceDeviceId,
                "changedByDeviceId" to revision.changedByDeviceId,
                "updatedAt" to Instant.ofEpochMilli(revision.updatedAt).toString(),
                "entry" to mapOf(
                    "entryType" to revision.entryType,
                    "title" to revision.title.trim(),
                    "activityId" to revision.activityId,
                    "categoryId" to revision.categoryId,
                    "startedAt" to Instant.ofEpochMilli(revision.startedAt).toString(),
                    "endedAt" to Instant.ofEpochMilli(revision.endedAt).toString(),
                    "timeZoneId" to revision.timeZoneId,
                    "timeZoneOffsetMinutes" to revision.timeZoneOffsetMinutes,
                    "confirmationState" to revision.confirmationState,
                    "deletedAt" to null,
                ),
            )
        }
        return SyncJson.stringify(
            mapOf(
                "protocolVersion" to PROTOCOL_VERSION,
                "mode" to UPLOAD_ONLY_MODE,
                "deviceId" to me,
                "cursor" to null,
                "entryRevisions" to revisionDtos,
                "resolutions" to emptyList<Any>(),
            ),
        )
    }

    private fun parseUploadOnlyAcknowledgements(response: Map<String, Any?>): List<String> {
        require((response["protocolVersion"] as? Number)?.toInt() == PROTOCOL_VERSION)
        require(response["mode"] == UPLOAD_ONLY_MODE)
        require(response["cursor"] == null)
        require(response["hasMore"] == false)
        for (key in listOf("entryRevisions", "activities", "conflicts", "resolutions")) {
            val values = response[key] as? List<*> ?: throw IllegalArgumentException("Missing $key")
            require(values.isEmpty()) { "Upload-only replies cannot include $key." }
        }
        val resolutionIds = response["acceptedResolutionIds"] as? List<*>
            ?: throw IllegalArgumentException("Missing acceptedResolutionIds")
        require(resolutionIds.isEmpty())
        val accepted = response["acceptedRevisionIds"] as? List<*>
            ?: throw IllegalArgumentException("Missing acceptedRevisionIds")
        return accepted.map { it as? String ?: throw IllegalArgumentException("Invalid accepted revision id") }
    }

    /**
     * Reconcile local intervals into pending revisions. Open intervals
     * (endedAt null) are still being tracked and are exported once closed.
     */
    private suspend fun queueLocalChanges(me: String) {
        val intervals = timelineDao.getAllIntervals()
        for (interval in intervals) {
            val endedAt = interval.endedAt ?: continue
            val latest = syncDao.getLatestRevision(interval.entryId)
            if (latest != null &&
                latest.startedAt == interval.startedAt &&
                latest.endedAt == endedAt &&
                latest.activityId == interval.activityId &&
                latest.title == interval.title &&
                latest.entryType == interval.entryType &&
                latest.confirmationState == interval.confirmationState &&
                latest.deletedAt == interval.deletedAt
            ) {
                continue
            }
            syncDao.insertRevision(
                EntryRevisionEntity(
                    revisionId = UUID.randomUUID().toString(),
                    entryId = interval.entryId,
                    baseRevisionId = latest?.revisionId,
                    changedByDeviceId = me,
                    sourceDeviceId = interval.sourceDeviceId,
                    updatedAt = interval.updatedAt,
                    entryType = interval.entryType,
                    title = interval.title,
                    activityId = interval.activityId,
                    categoryId = null,
                    startedAt = interval.startedAt,
                    endedAt = endedAt,
                    timeZoneId = interval.timeZoneId,
                    timeZoneOffsetMinutes = interval.timeZoneOffsetMinutes,
                    confirmationState = interval.confirmationState,
                    deletedAt = interval.deletedAt,
                    acknowledged = false,
                    createdAt = now(),
                ),
            )
        }
    }

    private fun buildRequest(
        me: String,
        cursor: String?,
        revisions: List<EntryRevisionEntity>,
        resolutions: List<ConflictResolutionEntity>,
    ): String {
        fun revisionJson(revision: EntryRevisionEntity): Map<String, Any?> = mapOf(
            "revisionId" to revision.revisionId,
            "entryId" to revision.entryId,
            "baseRevisionId" to revision.baseRevisionId,
            "sourceDeviceId" to revision.sourceDeviceId,
            "changedByDeviceId" to revision.changedByDeviceId,
            "updatedAt" to Instant.ofEpochMilli(revision.updatedAt).toString(),
            "entry" to mapOf(
                "entryType" to revision.entryType,
                "title" to revision.title,
                "activityId" to revision.activityId,
                "categoryId" to revision.categoryId,
                "startedAt" to Instant.ofEpochMilli(revision.startedAt).toString(),
                "endedAt" to Instant.ofEpochMilli(revision.endedAt).toString(),
                "timeZoneId" to revision.timeZoneId,
                "timeZoneOffsetMinutes" to revision.timeZoneOffsetMinutes,
                "confirmationState" to revision.confirmationState,
                "deletedAt" to revision.deletedAt?.let { Instant.ofEpochMilli(it).toString() },
            ),
        )
        fun resolutionJson(resolution: ConflictResolutionEntity): Map<String, Any?> = mapOf(
            "resolutionId" to resolution.resolutionId,
            "conflictId" to resolution.conflictId,
            "action" to resolution.action,
            "selectedRevisionId" to resolution.selectedRevisionId,
            "resultEntryIds" to SyncJson.asList(SyncJson.parse(resolution.resultEntryIdsJson)),
            "resolvedByDeviceId" to resolution.resolvedByDeviceId,
            "resolvedAt" to Instant.ofEpochMilli(resolution.resolvedAt).toString(),
            "undoesResolutionId" to resolution.undoesResolutionId,
        )
        return SyncJson.stringify(
            mapOf(
                "protocolVersion" to PROTOCOL_VERSION,
                "deviceId" to me,
                "cursor" to cursor,
                "entryRevisions" to revisions.map(::revisionJson),
                "resolutions" to resolutions.map(::resolutionJson),
            ),
        )
    }

    private data class ParsedRevision(
        val revisionId: String,
        val entryId: String,
        val baseRevisionId: String?,
        val sourceDeviceId: String,
        val changedByDeviceId: String,
        val updatedAt: Long,
        val entryType: String,
        val title: String?,
        val activityId: String?,
        val categoryId: String?,
        val startedAt: Long,
        val endedAt: Long,
        val timeZoneId: String,
        val timeZoneOffsetMinutes: Int?,
        val confirmationState: String,
        val deletedAt: Long?,
    )

    private data class ParsedConflict(
        val conflictId: String,
        val conflictType: String,
        val entryIdsJson: String,
        val revisionIdsJson: String,
        val overlapStartAt: Long?,
        val overlapEndAt: Long?,
        val state: String,
        val resolutionId: String?,
    )

    private data class ParsedResolution(
        val resolutionId: String,
        val conflictId: String,
        val action: String,
        val selectedRevisionId: String?,
        val resultEntryIdsJson: String,
        val resolvedByDeviceId: String,
        val resolvedAt: Long,
        val undoesResolutionId: String?,
    )

    private data class ParsedExchange(
        val acceptedRevisionIds: List<String>,
        val acceptedResolutionIds: List<String>,
        val cursor: String,
        val hasMore: Boolean,
        val revisions: List<ParsedRevision>,
        val activities: List<ActivitySnapshotEntity>,
        val conflicts: List<ParsedConflict>,
        val resolutions: List<ParsedResolution>,
    )

    private fun parseInstant(value: Any?): Long {
        val text = value as? String ?: throw IllegalArgumentException("Bad instant.")
        return Instant.parse(text).toEpochMilli()
    }

    private fun parseExchange(response: Map<String, Any?>): ParsedExchange {
        fun reqString(map: Map<String, Any?>, key: String): String =
            map[key] as? String ?: throw IllegalArgumentException("Missing $key.")
        val revisions = SyncJson.asList(response["entryRevisions"]).map { item ->
            val map = SyncJson.asObject(item)
            val entry = SyncJson.asObject(map["entry"])
            ParsedRevision(
                revisionId = reqString(map, "revisionId"),
                entryId = reqString(map, "entryId"),
                baseRevisionId = map["baseRevisionId"] as? String,
                sourceDeviceId = reqString(map, "sourceDeviceId"),
                changedByDeviceId = reqString(map, "changedByDeviceId"),
                updatedAt = parseInstant(map["updatedAt"]),
                entryType = reqString(entry, "entryType"),
                title = entry["title"] as? String,
                activityId = entry["activityId"] as? String,
                categoryId = entry["categoryId"] as? String,
                startedAt = parseInstant(entry["startedAt"]),
                endedAt = parseInstant(entry["endedAt"]),
                timeZoneId = reqString(entry, "timeZoneId"),
                timeZoneOffsetMinutes = (entry["timeZoneOffsetMinutes"] as? Number)?.toInt(),
                confirmationState = reqString(entry, "confirmationState"),
                deletedAt = (entry["deletedAt"] as? String)?.let { parseInstant(it) },
            )
        }
        val activities = SyncJson.asList(response["activities"]).map { item ->
            val map = SyncJson.asObject(item)
            ActivitySnapshotEntity(
                activityId = reqString(map, "activityId"),
                title = reqString(map, "title"),
                categoryId = reqString(map, "categoryId"),
                color = map["color"] as? String,
                sortOrder = (map["sortOrder"] as? Number)?.toInt() ?: 0,
                isArchived = map["isArchived"] as? Boolean ?: false,
                snapshotVersion = reqString(map, "activityId"),
                receivedAt = now(),
            )
        }
        val conflicts = SyncJson.asList(response["conflicts"]).map { item ->
            val map = SyncJson.asObject(item)
            ParsedConflict(
                conflictId = reqString(map, "conflictId"),
                conflictType = reqString(map, "conflictType"),
                entryIdsJson = SyncJson.stringify(map["entryIds"] ?: emptyList<Any>()),
                revisionIdsJson = SyncJson.stringify(map["revisionIds"] ?: emptyList<Any>()),
                overlapStartAt = (map["overlapStartAt"] as? String)?.let { parseInstant(it) },
                overlapEndAt = (map["overlapEndAt"] as? String)?.let { parseInstant(it) },
                state = reqString(map, "state"),
                resolutionId = map["resolutionId"] as? String,
            )
        }
        val resolutions = SyncJson.asList(response["resolutions"]).map { item ->
            val map = SyncJson.asObject(item)
            ParsedResolution(
                resolutionId = reqString(map, "resolutionId"),
                conflictId = reqString(map, "conflictId"),
                action = reqString(map, "action"),
                selectedRevisionId = map["selectedRevisionId"] as? String,
                resultEntryIdsJson = SyncJson.stringify(map["resultEntryIds"] ?: emptyList<Any>()),
                resolvedByDeviceId = reqString(map, "resolvedByDeviceId"),
                resolvedAt = parseInstant(map["resolvedAt"]),
                undoesResolutionId = map["undoesResolutionId"] as? String,
            )
        }
        return ParsedExchange(
            acceptedRevisionIds = SyncJson.asList(response["acceptedRevisionIds"]).map {
                it as? String ?: throw IllegalArgumentException("Bad acceptedRevisionIds.")
            },
            acceptedResolutionIds = SyncJson.asList(response["acceptedResolutionIds"]).map {
                it as? String ?: throw IllegalArgumentException("Bad acceptedResolutionIds.")
            },
            cursor = reqString(response, "cursor"),
            hasMore = response["hasMore"] as? Boolean ?: false,
            revisions = revisions,
            activities = activities,
            conflicts = conflicts,
            resolutions = resolutions,
        )
    }

    private suspend fun applyPage(
        me: String,
        parsed: ParsedExchange,
        uploadedRevisions: List<EntryRevisionEntity>,
        uploadedResolutions: List<ConflictResolutionEntity>,
    ) {
        val stamp = now()
        for (revision in parsed.revisions) {
            val local = timelineDao.getInterval(revision.entryId)
            val entity = TimeIntervalEntity(
                entryId = revision.entryId,
                workdayId = local?.workdayId,
                entryType = revision.entryType,
                title = revision.title?.takeIf { it.isNotBlank() } ?: local?.title ?: "Unassigned",
                activityId = if (revision.entryType == "BREAK") null else revision.activityId,
                startedAt = revision.startedAt,
                endedAt = revision.endedAt,
                timeZoneId = revision.timeZoneId,
                timeZoneOffsetMinutes = revision.timeZoneOffsetMinutes ?: 0,
                confirmationState = revision.confirmationState,
                sourceDeviceId = revision.sourceDeviceId,
                updatedAt = revision.updatedAt,
                currentRevisionId = revision.revisionId,
                deletedAt = revision.deletedAt,
                syncedAt = local?.syncedAt,
            )
            timelineDao.putInterval(entity)
            // Keep host versions for lineage so future edits carry a base.
            syncDao.insertRevision(
                EntryRevisionEntity(
                    revisionId = revision.revisionId,
                    entryId = revision.entryId,
                    baseRevisionId = revision.baseRevisionId,
                    changedByDeviceId = revision.changedByDeviceId,
                    sourceDeviceId = revision.sourceDeviceId,
                    updatedAt = revision.updatedAt,
                    entryType = revision.entryType,
                    title = entity.title,
                    activityId = entity.activityId,
                    categoryId = revision.categoryId,
                    startedAt = revision.startedAt,
                    endedAt = revision.endedAt,
                    timeZoneId = revision.timeZoneId,
                    timeZoneOffsetMinutes = revision.timeZoneOffsetMinutes,
                    confirmationState = revision.confirmationState,
                    deletedAt = revision.deletedAt,
                    acknowledged = true,
                    createdAt = stamp,
                ),
            )
        }
        for (activity in parsed.activities) {
            timelineDao.putActivity(activity)
        }
        for (conflict in parsed.conflicts) {
            conflictDao.putConflict(
                SyncConflictEntity(
                    conflictId = conflict.conflictId,
                    conflictType = conflict.conflictType,
                    entryIdsJson = conflict.entryIdsJson,
                    revisionIdsJson = conflict.revisionIdsJson,
                    overlapStartAt = conflict.overlapStartAt,
                    overlapEndAt = conflict.overlapEndAt,
                    state = conflict.state,
                    resolutionId = conflict.resolutionId,
                    updatedAt = stamp,
                ),
            )
        }
        for (resolution in parsed.resolutions) {
            conflictDao.insertResolution(
                ConflictResolutionEntity(
                    resolutionId = resolution.resolutionId,
                    conflictId = resolution.conflictId,
                    action = resolution.action,
                    selectedRevisionId = resolution.selectedRevisionId,
                    resultEntryIdsJson = resolution.resultEntryIdsJson,
                    resolvedByDeviceId = resolution.resolvedByDeviceId,
                    resolvedAt = resolution.resolvedAt,
                    undoesResolutionId = resolution.undoesResolutionId,
                    acknowledged = true,
                ),
            )
        }
        if (parsed.acceptedRevisionIds.isNotEmpty()) {
            val acceptedRevisions = uploadedRevisions.filter { it.revisionId in parsed.acceptedRevisionIds }
            syncDao.markAcknowledged(acceptedRevisions.map { it.revisionId })
            for (revision in acceptedRevisions) {
                timelineDao.markSynced(revision.entryId, revision.revisionId, stamp)
            }
        }
        if (parsed.acceptedResolutionIds.isNotEmpty()) {
            conflictDao.markResolutionsAcknowledged(
                uploadedResolutions.map { it.resolutionId }.filter { parsed.acceptedResolutionIds.contains(it) },
            )
        }
        syncDao.putCursor(SyncCursorEntity(cursor = parsed.cursor))
        syncDao.putDevice(SyncDeviceEntity(me, "ANDROID", stamp))
    }

    companion object {
        const val PROTOCOL_VERSION = 1
        const val MAX_PAGES_PER_SYNC = 20
        const val MAX_UPLOAD_BATCH = 200
        const val UPLOAD_ONLY_MODE = "UPLOAD_ONLY"
        const val ENTRY_TITLE_CAPABILITY = "entry-title"
        const val UPLOAD_ONLY_CAPABILITY = "upload-only"
    }
}
