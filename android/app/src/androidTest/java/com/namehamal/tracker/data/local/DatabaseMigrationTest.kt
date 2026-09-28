package com.namehamal.tracker.data.local

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DatabaseMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TrackerDatabase::class.java,
    )

    @Test
    fun v3ToV4AddsTitlesAndAcknowledgementsWithoutChangingLegacyRows() {
        val databaseName = "migration-v3-v4-test"
        val startedAt = Instant.parse("2026-04-10T08:15:00Z").toEpochMilli()
        val endedAt = Instant.parse("2026-04-10T09:15:00Z").toEpochMilli()
        val revisionCreatedAt = Instant.parse("2026-04-10T09:20:00Z").toEpochMilli()
        helper.createDatabase(databaseName, 3).apply {
            execSQL(
                "INSERT INTO workdays VALUES (?, ?, ?, ?, ?)",
                arrayOf<Any?>("day-1", startedAt, null, "Asia/Yerevan", "ACTIVE"),
            )
            execSQL(
                "INSERT INTO activity_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                arrayOf<Any?>("activity-1", "Legacy planning", "category-1", null, 0, 0, "v1", startedAt),
            )
            execSQL(
                """INSERT INTO time_intervals
                    (entryId, workdayId, entryType, activityId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, sourceDeviceId, updatedAt,
                    currentRevisionId, deletedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "work-1", "day-1", "WORK", "activity-1", startedAt, endedAt,
                    "Asia/Yerevan", 240, "CONFIRMED", "phone-1", endedAt, "rev-1", null,
                ),
            )
            execSQL(
                """INSERT INTO time_intervals
                    (entryId, workdayId, entryType, activityId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, sourceDeviceId, updatedAt,
                    currentRevisionId, deletedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "break-1", "day-1", "BREAK", null, endedAt, null,
                    "Asia/Yerevan", 240, "CONFIRMED", "phone-1", endedAt, null, null,
                ),
            )
            execSQL(
                """INSERT INTO time_intervals
                    (entryId, workdayId, entryType, activityId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, sourceDeviceId, updatedAt,
                    currentRevisionId, deletedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "legacy-unassigned", "day-1", "WORK", "missing-activity", startedAt + 10_000,
                    endedAt + 10_000, "Asia/Yerevan", 240, "CONFIRMED", "phone-1", endedAt + 10_000, null, null,
                ),
            )
            execSQL(
                """INSERT INTO entry_revisions
                    (revisionId, entryId, baseRevisionId, changedByDeviceId, sourceDeviceId,
                    updatedAt, entryType, activityId, categoryId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, deletedAt, acknowledged, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "rev-1", "work-1", null, "phone-1", "phone-1", endedAt, "WORK",
                    "activity-1", null, startedAt, endedAt, "Asia/Yerevan", 240,
                    "CONFIRMED", null, 1, revisionCreatedAt,
                ),
            )
            execSQL(
                """INSERT INTO entry_revisions
                    (revisionId, entryId, baseRevisionId, changedByDeviceId, sourceDeviceId,
                    updatedAt, entryType, activityId, categoryId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, deletedAt, acknowledged, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "rev-pending", "legacy-unassigned", null, "phone-1", "phone-1", endedAt,
                    "WORK", "missing-activity", null, startedAt, endedAt, "Asia/Yerevan", 240,
                    "CONFIRMED", null, 0, revisionCreatedAt + 1,
                ),
            )
            execSQL("INSERT INTO sync_cursor (id, cursor) VALUES ('cursor', 'kept-cursor')")
            close()
        }

        val migrated = helper.runMigrationsAndValidate(
            databaseName,
            4,
            true,
            DatabaseMigrations.MIGRATION_3_4,
        )
        migrated.query(
            "SELECT title, syncedAt, startedAt, endedAt, timeZoneId, timeZoneOffsetMinutes, currentRevisionId FROM time_intervals WHERE entryId = 'work-1'",
        ).use { cursor ->
            cursor.moveToFirst()
            assertEquals("Legacy planning", cursor.getString(0))
            assertEquals(revisionCreatedAt, cursor.getLong(1))
            assertEquals(startedAt, cursor.getLong(2))
            assertEquals(endedAt, cursor.getLong(3))
            assertEquals("Asia/Yerevan", cursor.getString(4))
            assertEquals(240, cursor.getInt(5))
            assertEquals("rev-1", cursor.getString(6))
        }
        migrated.query("SELECT title, endedAt, syncedAt FROM time_intervals WHERE entryId = 'break-1'").use { cursor ->
            cursor.moveToFirst()
            assertEquals("Break", cursor.getString(0))
            assertNull(cursor.getString(1))
            assertNull(cursor.getString(2))
        }
        migrated.query("SELECT title, acknowledged, createdAt FROM entry_revisions WHERE revisionId = 'rev-1'").use { cursor ->
            cursor.moveToFirst()
            assertEquals("Legacy planning", cursor.getString(0))
            assertEquals(1, cursor.getInt(1))
            assertEquals(revisionCreatedAt, cursor.getLong(2))
        }
        migrated.query("SELECT title, syncedAt, startedAt FROM time_intervals WHERE entryId = 'legacy-unassigned'").use { cursor ->
            cursor.moveToFirst()
            assertEquals("Unassigned", cursor.getString(0))
            assertNull(cursor.getString(1))
            assertEquals(startedAt + 10_000, cursor.getLong(2))
        }
        migrated.query("SELECT title, acknowledged, createdAt FROM entry_revisions WHERE revisionId = 'rev-pending'").use { cursor ->
            cursor.moveToFirst()
            assertEquals("Unassigned", cursor.getString(0))
            assertEquals(0, cursor.getInt(1))
            assertEquals(revisionCreatedAt + 1, cursor.getLong(2))
        }
        migrated.query("SELECT cursor FROM sync_cursor WHERE id = 'cursor'").use { cursor ->
            cursor.moveToFirst()
            assertEquals("kept-cursor", cursor.getString(0))
        }
        migrated.close()
    }
}
