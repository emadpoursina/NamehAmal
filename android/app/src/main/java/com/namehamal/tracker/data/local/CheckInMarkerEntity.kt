package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "check_in_markers", indices = [Index("workdayId"), Index("entryId")])
data class CheckInMarkerEntity(
    @PrimaryKey val checkInId: String,
    val workdayId: String,
    val entryId: String,
    val dueAt: Long,
    val deliveredAt: Long?,
    val state: String,
)
