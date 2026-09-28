package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * User resolution or undo decision for one conflict (T037).
 * Applied as new revisions; history is append-only so undo stays reversible.
 */
@Entity(tableName = "conflict_resolutions")
data class ConflictResolutionEntity(
    @PrimaryKey val resolutionId: String,
    val conflictId: String,
    val action: String,
    val selectedRevisionId: String?,
    /** JSON array of new/current entry ids produced by the choice. */
    val resultEntryIdsJson: String,
    val resolvedByDeviceId: String,
    val resolvedAt: Long,
    val undoesResolutionId: String?,
    val acknowledged: Boolean,
)
