package com.namehamal.tracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** Room storage for sync conflicts and append-only resolution history (T037). */
@Dao
interface ConflictDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putConflict(conflict: SyncConflictEntity)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertResolution(resolution: ConflictResolutionEntity): Long

    @Query("SELECT * FROM sync_conflicts WHERE conflictId = :conflictId LIMIT 1")
    suspend fun getConflict(conflictId: String): SyncConflictEntity?

    @Query("SELECT * FROM sync_conflicts ORDER BY updatedAt DESC")
    fun observeConflicts(): Flow<List<SyncConflictEntity>>

    @Query("SELECT * FROM sync_conflicts WHERE state = 'UNRESOLVED' OR state = 'UNDONE' ORDER BY updatedAt DESC")
    fun observeVisibleConflicts(): Flow<List<SyncConflictEntity>>

    @Query("SELECT * FROM sync_conflicts WHERE state = 'UNRESOLVED' OR state = 'UNDONE' ORDER BY updatedAt DESC")
    suspend fun getVisibleConflicts(): List<SyncConflictEntity>

    @Query("SELECT * FROM conflict_resolutions WHERE conflictId = :conflictId ORDER BY resolvedAt ASC")
    suspend fun getResolutions(conflictId: String): List<ConflictResolutionEntity>

    @Query("SELECT * FROM conflict_resolutions WHERE acknowledged = 0 ORDER BY resolvedAt ASC")
    suspend fun getPendingResolutions(): List<ConflictResolutionEntity>

    @Query("UPDATE conflict_resolutions SET acknowledged = 1 WHERE resolutionId IN (:resolutionIds)")
    suspend fun markResolutionsAcknowledged(resolutionIds: List<String>)
}
