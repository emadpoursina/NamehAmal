package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Overlap or competing-edit conflict delivered by sync (T037).
 * Original source records are never removed; unresolved conflicts stay visible.
 */
@Entity(tableName = "sync_conflicts")
data class SyncConflictEntity(
    @PrimaryKey val conflictId: String,
    val conflictType: String,
    /** JSON array of involved logical entry ids. */
    val entryIdsJson: String,
    /** JSON array of the exact competing revision ids. */
    val revisionIdsJson: String,
    val overlapStartAt: Long?,
    val overlapEndAt: Long?,
    val state: String,
    val resolutionId: String?,
    val updatedAt: Long,
)
