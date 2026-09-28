package com.namehamal.tracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TimelineDao {
    @Query("SELECT * FROM workdays WHERE state = 'ACTIVE' LIMIT 1")
    suspend fun getActiveWorkday(): WorkdayEntity?

    @Query("SELECT * FROM workdays WHERE workdayId = :workdayId LIMIT 1")
    suspend fun getWorkday(workdayId: String): WorkdayEntity?

    @Query("SELECT * FROM workdays WHERE state = 'ACTIVE' LIMIT 1")
    fun observeActiveWorkday(): Flow<WorkdayEntity?>

    @Query("SELECT * FROM workdays ORDER BY startedAt DESC")
    fun observeWorkdays(): Flow<List<WorkdayEntity>>

    @Query("SELECT * FROM time_intervals WHERE workdayId = :workdayId AND deletedAt IS NULL ORDER BY startedAt ASC")
    suspend fun getIntervals(workdayId: String): List<TimeIntervalEntity>

    @Query("SELECT * FROM time_intervals WHERE deletedAt IS NULL ORDER BY startedAt DESC, entryId DESC")
    fun observeTimeline(): Flow<List<TimeIntervalEntity>>

    @Query("SELECT * FROM time_intervals WHERE deletedAt IS NULL ORDER BY startedAt DESC, entryId DESC")
    fun observeEvents(): Flow<List<TimeIntervalEntity>>

    @Query("SELECT TRIM(title) AS title FROM time_intervals WHERE deletedAt IS NULL AND TRIM(title) != '' GROUP BY TRIM(title) ORDER BY MAX(startedAt) DESC, TRIM(title) COLLATE NOCASE ASC")
    fun observeTitleSuggestions(): Flow<List<String>>

    @Query("SELECT * FROM time_intervals WHERE endedAt IS NULL AND deletedAt IS NULL ORDER BY startedAt DESC, entryId DESC LIMIT 1")
    suspend fun getRunningInterval(): TimeIntervalEntity?

    @Query("SELECT * FROM time_intervals WHERE workdayId = :workdayId AND endedAt IS NULL AND deletedAt IS NULL LIMIT 1")
    suspend fun getOpenInterval(workdayId: String): TimeIntervalEntity?

    @Query("SELECT * FROM time_intervals WHERE entryId = :entryId LIMIT 1")
    suspend fun getInterval(entryId: String): TimeIntervalEntity?

    @Query("SELECT * FROM time_intervals WHERE deletedAt IS NULL ORDER BY startedAt ASC")
    suspend fun getAllIntervals(): List<TimeIntervalEntity>

    @Query("SELECT entryId FROM time_intervals")
    suspend fun getAllStoredIntervalIds(): List<String>

    @Query("SELECT entryId FROM time_intervals WHERE syncedAt IS NOT NULL AND deletedAt IS NULL")
    suspend fun getSyncedEntryIds(): List<String>

    @Query("UPDATE time_intervals SET syncedAt = :syncedAt, currentRevisionId = :revisionId WHERE entryId = :entryId AND endedAt IS NOT NULL AND deletedAt IS NULL")
    suspend fun markSynced(entryId: String, revisionId: String, syncedAt: Long)

    @Query("DELETE FROM time_intervals WHERE entryId = :entryId")
    suspend fun deleteInterval(entryId: String)

    @Query("DELETE FROM time_intervals WHERE entryId IN (:entryIds)")
    suspend fun deleteIntervals(entryIds: List<String>): Int

    @Query("DELETE FROM time_intervals WHERE syncedAt IS NOT NULL AND deletedAt IS NULL")
    suspend fun deleteSyncedIntervals()

    @Query("SELECT * FROM time_intervals WHERE workdayId = :workdayId AND endedAt IS NULL AND deletedAt IS NULL LIMIT 1")
    suspend fun getOpenIntervalForWorkday(workdayId: String): TimeIntervalEntity?

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertWorkday(workday: WorkdayEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertInterval(interval: TimeIntervalEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putInterval(interval: TimeIntervalEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putWorkday(workday: WorkdayEntity)

    @Update
    suspend fun updateWorkday(workday: WorkdayEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putActivity(activity: ActivitySnapshotEntity)

    @Query("DELETE FROM activity_snapshots")
    suspend fun clearActivities()

    @Query("SELECT * FROM activity_snapshots WHERE isArchived = 0 ORDER BY sortOrder, title")
    fun observeActivities(): Flow<List<ActivitySnapshotEntity>>

    @Query("SELECT * FROM activity_snapshots WHERE activityId = :activityId LIMIT 1")
    suspend fun getActivity(activityId: String): ActivitySnapshotEntity?
}
