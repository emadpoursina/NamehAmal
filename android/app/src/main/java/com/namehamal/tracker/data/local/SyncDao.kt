package com.namehamal.tracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** Room storage for sync devices, pending revisions, and the opaque host cursor (T030). */
@Dao
interface SyncDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putDevice(device: SyncDeviceEntity)

    @Query("SELECT * FROM sync_devices WHERE deviceId = :deviceId LIMIT 1")
    suspend fun getDevice(deviceId: String): SyncDeviceEntity?

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertRevision(revision: EntryRevisionEntity): Long

    @Query("SELECT * FROM entry_revisions WHERE acknowledged = 0 ORDER BY createdAt ASC")
    suspend fun getPendingRevisions(): List<EntryRevisionEntity>

    @Query("SELECT COUNT(*) FROM entry_revisions WHERE acknowledged = 0")
    suspend fun getPendingCount(): Int

    @Query("UPDATE entry_revisions SET acknowledged = 1 WHERE revisionId IN (:revisionIds)")
    suspend fun markAcknowledged(revisionIds: List<String>)

    @Query("SELECT * FROM entry_revisions WHERE entryId = :entryId ORDER BY createdAt DESC LIMIT 1")
    suspend fun getLatestRevision(entryId: String): EntryRevisionEntity?

    @Query("DELETE FROM entry_revisions WHERE entryId = :entryId")
    suspend fun deleteRevisionsForEntry(entryId: String)

    @Query("DELETE FROM entry_revisions WHERE entryId IN (:entryIds)")
    suspend fun deleteRevisionsForEntries(entryIds: List<String>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putCursor(cursor: SyncCursorEntity)

    @Query("SELECT * FROM sync_cursor WHERE id = 'cursor' LIMIT 1")
    suspend fun getCursor(): SyncCursorEntity?

    @Query("SELECT * FROM sync_cursor WHERE id = 'cursor' LIMIT 1")
    fun observeCursor(): Flow<SyncCursorEntity?>
}
