package com.namehamal.tracker.data.local

import androidx.room.withTransaction
import com.namehamal.tracker.domain.IntervalRecord
import com.namehamal.tracker.domain.IntervalRules
import com.namehamal.tracker.domain.SessionRules
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.flow.Flow

class TimelineRepository(
    private val database: TrackerDatabase,
    private val sourceDeviceId: String,
) : SessionRepository {
    private val dao get() = database.workdayDao()
    private val checkIns get() = database.checkInDao()

    fun observeActiveWorkday(): Flow<WorkdayEntity?> = dao.observeActiveWorkday()
    fun observeTimeline(): Flow<List<TimeIntervalEntity>> = dao.observeTimeline()
    fun observeActivities(): Flow<List<ActivitySnapshotEntity>> = dao.observeActivities()

    override fun observeEvents(): Flow<List<TimeIntervalEntity>> = dao.observeEvents()
    override fun observeTitleSuggestions(): Flow<List<String>> = dao.observeTitleSuggestions()

    override suspend fun createCompletedSession(
        title: String,
        startedAtLocal: String,
        endedAtLocal: String,
        zoneId: String,
        now: Instant,
    ): TimeIntervalEntity = database.withTransaction {
        val session = SessionRules.completed(title, startedAtLocal, endedAtLocal, zoneId)
        newSession(session, now.toEpochMilli()).also { dao.insertInterval(it) }
    }

    override suspend fun startSession(
        title: String,
        startedAtLocal: String,
        zoneId: String,
        now: Instant,
    ): TimeIntervalEntity = database.withTransaction {
        require(dao.getRunningInterval() == null) {
            "A session is already running. Stop it before starting another."
        }
        val session = SessionRules.running(title, startedAtLocal, zoneId, now)
        newSession(session, now.toEpochMilli()).also { dao.insertInterval(it) }
    }

    override suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity = database.withTransaction {
        val event = requireNotNull(dao.getInterval(entryId)) { "Session not found." }
        require(event.endedAt == null) { "This session has already stopped." }
        SessionRules.stop(Instant.ofEpochMilli(event.startedAt), at)
        event.copy(endedAt = at.toEpochMilli(), updatedAt = at.toEpochMilli(), syncedAt = null).also {
            dao.putInterval(it)
        }
    }

    override suspend fun removeSession(entryId: String): Boolean = database.withTransaction {
        if (dao.getInterval(entryId) == null) return@withTransaction false
        database.syncDao().deleteRevisionsForEntry(entryId)
        dao.deleteInterval(entryId)
        true
    }

    override suspend fun clearSyncedSessions(): Int = database.withTransaction {
        val ids = dao.getSyncedEntryIds()
        if (ids.isEmpty()) return@withTransaction 0
        database.syncDao().deleteRevisionsForEntries(ids)
        dao.deleteSyncedIntervals()
        ids.size
    }

    suspend fun startWorkday(at: Instant, activityId: String?, zoneId: ZoneId): WorkdayEntity =
        database.withTransaction {
            check(dao.getActiveWorkday() == null) { "A workday is already active." }
            requireAvailableActivity(activityId)
            val workday = WorkdayEntity(
                workdayId = UUID.randomUUID().toString(),
                startedAt = at.toEpochMilli(),
                endedAt = null,
                timeZoneId = zoneId.id,
                state = ACTIVE,
            )
            dao.insertWorkday(workday)
            dao.insertInterval(newInterval(workday.workdayId, IntervalRules.WORK, activityId, at, zoneId))
            workday
        }

    suspend fun changeActivity(activityId: String?, at: Instant, zoneId: ZoneId) =
        transition(IntervalRules.WORK, activityId, at, zoneId)

    suspend fun startBreak(at: Instant, zoneId: ZoneId) =
        transition(IntervalRules.BREAK, null, at, zoneId)

    suspend fun resumeActivity(activityId: String?, at: Instant, zoneId: ZoneId) =
        transition(IntervalRules.WORK, activityId, at, zoneId)

    suspend fun endWorkday(at: Instant) {
        database.withTransaction {
            val workday = requireNotNull(dao.getActiveWorkday()) { "No workday is active." }
            val open = requireNotNull(dao.getOpenInterval(workday.workdayId)) { "No interval is active." }
            val closed = IntervalRules.close(open.toRecord(), at)
            dao.putInterval(open.copy(endedAt = closed.endedAt!!.toEpochMilli(), updatedAt = at.toEpochMilli()))
            dao.updateWorkday(workday.copy(endedAt = at.toEpochMilli(), state = ENDED))
        }
    }

    suspend fun editInterval(entryId: String, startedAt: Instant, endedAt: Instant, activityId: String?) {
        database.withTransaction {
            val current = requireNotNull(dao.getInterval(entryId)) { "Interval not found." }
            requireAvailableActivity(activityId)
            val edited = IntervalRules.edit(current.toRecord(), startedAt, endedAt, activityId)
            dao.putInterval(current.copy(
                activityId = edited.activityId,
                startedAt = edited.startedAt.toEpochMilli(),
                endedAt = edited.endedAt!!.toEpochMilli(),
                timeZoneOffsetMinutes = edited.timeZoneOffsetMinutes,
                updatedAt = Instant.now().toEpochMilli(),
            ))
        }
    }

    suspend fun splitInterval(entryId: String, boundary: Instant): Pair<String, String> = database.withTransaction {
        val current = requireNotNull(dao.getInterval(entryId)) { "Interval not found." }
        val leftId = current.entryId
        val rightId = UUID.randomUUID().toString()
        val (left, right) = IntervalRules.split(current.toRecord(), boundary, leftId, rightId)
        val now = Instant.now().toEpochMilli()
        dao.putInterval(current.copy(
            startedAt = left.startedAt.toEpochMilli(),
            endedAt = left.endedAt!!.toEpochMilli(),
            updatedAt = now,
        ))
        dao.insertInterval(current.copy(
            entryId = right.entryId,
            startedAt = right.startedAt.toEpochMilli(),
            endedAt = right.endedAt!!.toEpochMilli(),
            timeZoneOffsetMinutes = right.timeZoneOffsetMinutes,
            updatedAt = now,
        ))
        leftId to rightId
    }

    suspend fun saveActivitySnapshot(activity: ActivitySnapshotEntity) = dao.putActivity(activity)

    suspend fun recordCheckIn(workdayId: String, dueAt: Instant): String? = database.withTransaction {
        val active = dao.getActiveWorkday() ?: return@withTransaction null
        if (active.workdayId != workdayId) return@withTransaction null
        val current = dao.getOpenInterval(workdayId) ?: return@withTransaction null
        val pendingIds = checkIns.pendingEntryIds(workdayId)
        checkIns.markPendingMissed(workdayId)
        if (pendingIds.isNotEmpty()) checkIns.markIntervalsUnconfirmed(pendingIds)
        val id = UUID.randomUUID().toString()
        checkIns.insert(CheckInMarkerEntity(
            checkInId = id,
            workdayId = workdayId,
            entryId = current.entryId,
            dueAt = dueAt.toEpochMilli(),
            deliveredAt = null,
            state = PENDING,
        ))
        id
    }

    suspend fun confirmCheckIn(checkInId: String): Boolean = database.withTransaction {
        val marker = checkIns.get(checkInId) ?: return@withTransaction false
        if (dao.getActiveWorkday()?.workdayId != marker.workdayId) return@withTransaction false
        if (dao.getOpenIntervalForWorkday(marker.workdayId)?.entryId != marker.entryId) return@withTransaction false
        checkIns.markConfirmed(checkInId)
        checkIns.markIntervalConfirmed(marker.entryId)
        true
    }

    suspend fun confirmInterval(entryId: String) = checkIns.markIntervalConfirmed(entryId)

    suspend fun markCheckInMissed(checkInId: String) = database.withTransaction {
        val marker = checkIns.get(checkInId) ?: return@withTransaction
        if (marker.state != MISSED && marker.state != CONFIRMED) {
            checkIns.markMissed(checkInId)
            checkIns.markIntervalsUnconfirmed(listOf(marker.entryId))
        }
    }

    suspend fun markCheckInDelivered(checkInId: String, deliveredAt: Instant) =
        checkIns.markDelivered(checkInId, deliveredAt.toEpochMilli())

    private suspend fun transition(entryType: String, activityId: String?, at: Instant, zoneId: ZoneId) {
        database.withTransaction {
            val workday = requireNotNull(dao.getActiveWorkday()) { "No workday is active." }
            requireAvailableActivity(activityId)
            val current = requireNotNull(dao.getOpenInterval(workday.workdayId)) { "No interval is active." }
            val (closed, opened) = IntervalRules.transition(
                current.toRecord(), UUID.randomUUID().toString(), entryType, activityId, at, zoneId.id,
            )
            dao.putInterval(current.copy(
                endedAt = closed.endedAt!!.toEpochMilli(),
                updatedAt = at.toEpochMilli(),
            ))
            dao.insertInterval(newInterval(workday.workdayId, opened.entryType, opened.activityId, at, zoneId, opened.entryId))
        }
    }

    private fun newInterval(
        workdayId: String,
        type: String,
        activityId: String?,
        at: Instant,
        zoneId: ZoneId,
        entryId: String = UUID.randomUUID().toString(),
    ) = TimeIntervalEntity(
        entryId = entryId,
        workdayId = workdayId,
        entryType = type,
        activityId = if (type == IntervalRules.BREAK) null else activityId,
        startedAt = at.toEpochMilli(),
        endedAt = null,
        timeZoneId = zoneId.id,
        timeZoneOffsetMinutes = IntervalRules.offsetMinutesAt(at, zoneId.id),
        confirmationState = CONFIRMED,
        sourceDeviceId = sourceDeviceId,
        updatedAt = at.toEpochMilli(),
    )

    private suspend fun requireAvailableActivity(activityId: String?) {
        if (activityId != null) {
            require(dao.getActivity(activityId)?.isArchived == false) {
                "That activity is not in the most recently synced activity list. Choose Unassigned or sync activities first."
            }
        }
    }

    private fun newSession(session: SessionRules.SessionTimes, updatedAt: Long) = TimeIntervalEntity(
        entryId = UUID.randomUUID().toString(),
        workdayId = null,
        entryType = IntervalRules.WORK,
        activityId = null,
        startedAt = session.startedAt.toEpochMilli(),
        endedAt = session.endedAt?.toEpochMilli(),
        timeZoneId = session.timeZoneId,
        timeZoneOffsetMinutes = session.timeZoneOffsetMinutes,
        confirmationState = CONFIRMED,
        sourceDeviceId = sourceDeviceId,
        updatedAt = updatedAt,
        currentRevisionId = null,
        deletedAt = null,
        title = session.title,
        syncedAt = null,
    )

    private fun TimeIntervalEntity.toRecord() = IntervalRecord(
        entryId = entryId,
        workdayId = workdayId.orEmpty(),
        entryType = entryType,
        activityId = activityId,
        startedAt = Instant.ofEpochMilli(startedAt),
        endedAt = endedAt?.let(Instant::ofEpochMilli),
        timeZoneId = timeZoneId,
        timeZoneOffsetMinutes = timeZoneOffsetMinutes,
    )

    companion object {
        const val ACTIVE = "ACTIVE"
        const val ENDED = "ENDED"
        const val PENDING = "PENDING"
        const val CONFIRMED = "CONFIRMED"
        const val MISSED = "MISSED"
    }
}
