package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.ColumnInfo
import androidx.room.PrimaryKey

/**
 * Immutable entry revision queued for upload until the host acknowledges it.
 * Repeating a revisionId is an idempotent no-op; retries never duplicate records.
 */
@Entity(tableName = "entry_revisions")
data class EntryRevisionEntity(
    @PrimaryKey val revisionId: String,
    val entryId: String,
    val baseRevisionId: String?,
    val changedByDeviceId: String,
    val sourceDeviceId: String,
    val updatedAt: Long,
    val entryType: String,
    val activityId: String?,
    val categoryId: String?,
    val startedAt: Long,
    val endedAt: Long,
    val timeZoneId: String,
    val timeZoneOffsetMinutes: Int?,
    val confirmationState: String,
    val deletedAt: Long?,
    val acknowledged: Boolean,
    val createdAt: Long,
    @ColumnInfo(defaultValue = "'Unassigned'") val title: String = "Unassigned",
)
