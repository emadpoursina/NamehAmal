package com.namehamal.tracker.data.local

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object DatabaseMigrations {
    val MIGRATION_1_2 = object : Migration(1, 2) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS check_in_markers (
                    checkInId TEXT NOT NULL PRIMARY KEY,
                    workdayId TEXT NOT NULL,
                    entryId TEXT NOT NULL,
                    dueAt INTEGER NOT NULL,
                    deliveredAt INTEGER,
                    state TEXT NOT NULL
                )""".trimIndent(),
            )
            db.execSQL("CREATE INDEX IF NOT EXISTS index_check_in_markers_workdayId ON check_in_markers(workdayId)")
            db.execSQL("CREATE INDEX IF NOT EXISTS index_check_in_markers_entryId ON check_in_markers(entryId)")
        }
    }

    val MIGRATION_2_3 = object : Migration(2, 3) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS sync_devices (
                    deviceId TEXT NOT NULL PRIMARY KEY,
                    deviceType TEXT NOT NULL,
                    lastSeenAt INTEGER
                )""".trimIndent(),
            )
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS entry_revisions (
                    revisionId TEXT NOT NULL PRIMARY KEY,
                    entryId TEXT NOT NULL,
                    baseRevisionId TEXT,
                    changedByDeviceId TEXT NOT NULL,
                    sourceDeviceId TEXT NOT NULL,
                    updatedAt INTEGER NOT NULL,
                    entryType TEXT NOT NULL,
                    activityId TEXT,
                    categoryId TEXT,
                    startedAt INTEGER NOT NULL,
                    endedAt INTEGER NOT NULL,
                    timeZoneId TEXT NOT NULL,
                    timeZoneOffsetMinutes INTEGER,
                    confirmationState TEXT NOT NULL,
                    deletedAt INTEGER,
                    acknowledged INTEGER NOT NULL,
                    createdAt INTEGER NOT NULL
                )""".trimIndent(),
            )
            db.execSQL("CREATE INDEX IF NOT EXISTS index_entry_revisions_entryId ON entry_revisions(entryId)")
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS sync_cursor (
                    id TEXT NOT NULL PRIMARY KEY,
                    cursor TEXT
                )""".trimIndent(),
            )
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS sync_conflicts (
                    conflictId TEXT NOT NULL PRIMARY KEY,
                    conflictType TEXT NOT NULL,
                    entryIdsJson TEXT NOT NULL,
                    revisionIdsJson TEXT NOT NULL,
                    overlapStartAt INTEGER,
                    overlapEndAt INTEGER,
                    state TEXT NOT NULL,
                    resolutionId TEXT,
                    updatedAt INTEGER NOT NULL
                )""".trimIndent(),
            )
            db.execSQL(
                """CREATE TABLE IF NOT EXISTS conflict_resolutions (
                    resolutionId TEXT NOT NULL PRIMARY KEY,
                    conflictId TEXT NOT NULL,
                    action TEXT NOT NULL,
                    selectedRevisionId TEXT,
                    resultEntryIdsJson TEXT NOT NULL,
                    resolvedByDeviceId TEXT NOT NULL,
                    resolvedAt INTEGER NOT NULL,
                    undoesResolutionId TEXT,
                    acknowledged INTEGER NOT NULL
                )""".trimIndent(),
            )
            db.execSQL("CREATE INDEX IF NOT EXISTS index_conflict_resolutions_conflictId ON conflict_resolutions(conflictId)")
        }
    }

    val MIGRATION_3_4 = object : Migration(3, 4) {
        override fun migrate(db: SupportSQLiteDatabase) {
            db.execSQL("ALTER TABLE time_intervals ADD COLUMN title TEXT NOT NULL DEFAULT 'Unassigned'")
            db.execSQL("ALTER TABLE time_intervals ADD COLUMN syncedAt INTEGER")
            db.execSQL(
                """UPDATE time_intervals
                    SET title = CASE
                        WHEN entryType = 'BREAK' THEN 'Break'
                        ELSE COALESCE(
                            NULLIF(TRIM((SELECT title FROM activity_snapshots
                                WHERE activity_snapshots.activityId = time_intervals.activityId)), ''),
                            'Unassigned'
                        )
                    END""".trimIndent(),
            )
            db.execSQL(
                """UPDATE time_intervals
                    SET syncedAt = COALESCE(
                        (SELECT createdAt FROM entry_revisions
                            WHERE entry_revisions.revisionId = time_intervals.currentRevisionId
                                AND entry_revisions.acknowledged = 1),
                        (SELECT MAX(createdAt) FROM entry_revisions
                            WHERE entry_revisions.entryId = time_intervals.entryId
                                AND entry_revisions.acknowledged = 1)
                    )
                    WHERE EXISTS (SELECT 1 FROM entry_revisions
                        WHERE entry_revisions.entryId = time_intervals.entryId
                            AND entry_revisions.acknowledged = 1)
                        AND NOT EXISTS (SELECT 1 FROM entry_revisions
                            WHERE entry_revisions.entryId = time_intervals.entryId
                                AND entry_revisions.acknowledged = 0)""".trimIndent(),
            )
            db.execSQL("ALTER TABLE entry_revisions ADD COLUMN title TEXT NOT NULL DEFAULT 'Unassigned'")
            db.execSQL(
                """UPDATE entry_revisions
                    SET title = COALESCE(
                        (SELECT title FROM time_intervals
                            WHERE time_intervals.entryId = entry_revisions.entryId),
                        'Unassigned'
                    )""".trimIndent(),
            )
        }
    }

    val ALL: Array<Migration> = arrayOf(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
}
