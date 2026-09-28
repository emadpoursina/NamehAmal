package com.namehamal.tracker.data.local

import java.time.Instant
import kotlinx.coroutines.flow.Flow

/** Local-first surface used by the simplified tracking workflow. */
interface SessionRepository {
    fun observeActivities(): Flow<List<ActivitySnapshotEntity>>
    fun observeCategories(): Flow<List<CategorySnapshotEntity>>
    fun observeEvents(): Flow<List<TimeIntervalEntity>>
    fun observeTitleSuggestions(): Flow<List<String>>
    suspend fun createCompletedSession(
        title: String,
        startedAtLocal: String,
        endedAtLocal: String,
        categoryId: String,
        zoneId: String,
        now: Instant,
        activityId: String? = null,
    ): TimeIntervalEntity
    suspend fun startSession(
        title: String,
        startedAtLocal: String,
        categoryId: String,
        zoneId: String,
        now: Instant,
        activityId: String? = null,
    ): TimeIntervalEntity
    suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity
    suspend fun removeSession(entryId: String): Boolean
    suspend fun removeSessions(entryIds: Set<String>): Int
    suspend fun clearAllSessions(): Int
    suspend fun clearSyncedSessions(): Int
}
