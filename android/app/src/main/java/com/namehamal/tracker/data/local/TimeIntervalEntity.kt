package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.ColumnInfo

@Entity(
    tableName = "time_intervals",
    foreignKeys = [ForeignKey(
        entity = WorkdayEntity::class,
        parentColumns = ["workdayId"],
        childColumns = ["workdayId"],
        onDelete = ForeignKey.RESTRICT,
    )],
    indices = [Index("workdayId"), Index("startedAt"), Index("activityId")],
)
data class TimeIntervalEntity(
    @PrimaryKey val entryId: String,
    val workdayId: String?,
    val entryType: String,
    val activityId: String?,
    val startedAt: Long,
    val endedAt: Long?,
    val timeZoneId: String,
    val timeZoneOffsetMinutes: Int,
    val confirmationState: String,
    val sourceDeviceId: String,
    val updatedAt: Long,
    val currentRevisionId: String? = null,
    val deletedAt: Long? = null,
    @ColumnInfo(defaultValue = "'Unassigned'") val title: String = "Unassigned",
    val syncedAt: Long? = null,
)
