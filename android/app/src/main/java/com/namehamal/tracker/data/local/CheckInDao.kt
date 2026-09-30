package com.namehamal.tracker.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface CheckInDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(marker: CheckInMarkerEntity)

    @Query("SELECT * FROM check_in_markers WHERE checkInId = :checkInId LIMIT 1")
    suspend fun get(checkInId: String): CheckInMarkerEntity?

    @Query("SELECT * FROM check_in_markers WHERE workdayId = :workdayId ORDER BY dueAt")
    suspend fun getForWorkday(workdayId: String): List<CheckInMarkerEntity>

    @Query("SELECT entryId FROM check_in_markers WHERE workdayId = :workdayId AND state = 'PENDING'")
    suspend fun pendingEntryIds(workdayId: String): List<String>

    @Query("UPDATE check_in_markers SET state = 'MISSED' WHERE workdayId = :workdayId AND state = 'PENDING'")
    suspend fun markPendingMissed(workdayId: String)

    @Query("SELECT * FROM check_in_markers WHERE entryId = :entryId ORDER BY dueAt")
    suspend fun getForEntry(entryId: String): List<CheckInMarkerEntity>

    @Query("SELECT entryId FROM check_in_markers WHERE entryId = :entryId AND state = 'PENDING'")
    suspend fun pendingEntryIdsForEntry(entryId: String): List<String>

    @Query("UPDATE check_in_markers SET state = 'MISSED' WHERE entryId = :entryId AND state = 'PENDING'")
    suspend fun markEntryPendingMissed(entryId: String)

    @Query("UPDATE check_in_markers SET state = 'MISSED' WHERE checkInId = :checkInId AND state = 'PENDING'")
    suspend fun markMissed(checkInId: String)

    @Query("UPDATE check_in_markers SET state = 'CONFIRMED' WHERE checkInId = :checkInId")
    suspend fun markConfirmed(checkInId: String)

    @Query("UPDATE check_in_markers SET deliveredAt = :deliveredAt WHERE checkInId = :checkInId")
    suspend fun markDelivered(checkInId: String, deliveredAt: Long)

    @Query("UPDATE time_intervals SET confirmationState = 'UNCONFIRMED' WHERE entryId IN (:entryIds)")
    suspend fun markIntervalsUnconfirmed(entryIds: List<String>)

    @Query("UPDATE time_intervals SET confirmationState = 'CONFIRMED' WHERE entryId = :entryId")
    suspend fun markIntervalConfirmed(entryId: String)
}
