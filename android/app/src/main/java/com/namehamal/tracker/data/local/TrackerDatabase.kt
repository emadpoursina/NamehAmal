package com.namehamal.tracker.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        WorkdayEntity::class,
        TimeIntervalEntity::class,
        ActivitySnapshotEntity::class,
        CheckInMarkerEntity::class,
        SyncDeviceEntity::class,
        EntryRevisionEntity::class,
        SyncCursorEntity::class,
        SyncConflictEntity::class,
        ConflictResolutionEntity::class,
    ],
    version = 4,
    exportSchema = true,
)
abstract class TrackerDatabase : RoomDatabase() {
    abstract fun workdayDao(): TimelineDao
    abstract fun checkInDao(): CheckInDao
    abstract fun syncDao(): SyncDao
    abstract fun conflictDao(): ConflictDao

    companion object {
        @Volatile private var instance: TrackerDatabase? = null

        fun getInstance(context: Context): TrackerDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                TrackerDatabase::class.java,
                "tracker.db",
            ).addMigrations(*DatabaseMigrations.ALL).build().also { instance = it }
        }
    }
}
