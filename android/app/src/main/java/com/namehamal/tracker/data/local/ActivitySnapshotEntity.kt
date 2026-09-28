package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "activity_snapshots")
data class ActivitySnapshotEntity(
    @PrimaryKey val activityId: String,
    val title: String,
    val categoryId: String,
    val color: String?,
    val sortOrder: Int,
    val isArchived: Boolean,
    val snapshotVersion: String,
    val receivedAt: Long,
)
