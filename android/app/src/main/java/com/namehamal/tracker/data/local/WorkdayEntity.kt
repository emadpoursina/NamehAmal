package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "workdays", indices = [Index("state")])
data class WorkdayEntity(
    @PrimaryKey val workdayId: String,
    val startedAt: Long,
    val endedAt: Long?,
    val timeZoneId: String,
    val state: String,
)
