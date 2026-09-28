package com.namehamal.tracker.data.local

import java.time.Instant
import kotlinx.coroutines.flow.Flow

/** Local-first surface used by the simplified tracking workflow. */
interface SessionRepository {
    fun observeEvents(): Flow<List<TimeIntervalEntity>>
    fun observeTitleSuggestions(): Flow<List<String>>
    suspend fun createCompletedSession(
        title: String,
        startedAtLocal: String,
        endedAtLocal: String,
        zoneId: String,
        now: Instant,
    ): TimeIntervalEntity
    suspend fun startSession(
        title: String,
        startedAtLocal: String,
        zoneId: String,
        now: Instant,
    ): TimeIntervalEntity
    suspend fun stopSession(entryId: String, at: Instant): TimeIntervalEntity
    suspend fun removeSession(entryId: String): Boolean
    suspend fun clearSyncedSessions(): Int
}
