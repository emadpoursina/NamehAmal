package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Opaque host change cursor; advanced only after a fully committed exchange (T030). */
@Entity(tableName = "sync_cursor")
data class SyncCursorEntity(
    @PrimaryKey val id: String = SINGLETON,
    val cursor: String?,
) {
    companion object {
        const val SINGLETON = "cursor"
    }
}
