package com.namehamal.tracker.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Stable sync identity for this installation and the desktop host (T030). Identity only, not a credential. */
@Entity(tableName = "sync_devices")
data class SyncDeviceEntity(
    @PrimaryKey val deviceId: String,
    val deviceType: String,
    val lastSeenAt: Long?,
)
