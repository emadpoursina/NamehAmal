package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Desktop-owned category metadata cached during an explicit sync. */
@Entity(tableName = "category_snapshots")
data class CategorySnapshotEntity(
    @PrimaryKey val categoryId: String,
    val name: String,
    val sortOrder: Int,
    val isArchived: Boolean,
    val receivedAt: Long,
)
