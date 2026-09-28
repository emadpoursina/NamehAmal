package com.namehamal.tracker.data.local

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CategoryMigrationTest {
    @get:Rule
    val helper = MigrationTestHelper(
        InstrumentationRegistry.getInstrumentation(),
        TrackerDatabase::class.java,
    )

    @Test
    fun v4ToV5PreservesSessionsAndRevisionLineageAndPersistsCategorySnapshots() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val databaseName = "category-migration-v4-v5-test"
        context.deleteDatabase(databaseName)

        helper.createDatabase(databaseName, 4).apply {
            execSQL(
                """INSERT INTO time_intervals
                    (entryId, workdayId, entryType, activityId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, sourceDeviceId, updatedAt,
                    currentRevisionId, deletedAt, title, syncedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "completed-legacy", null, "WORK", null, 1_000L, 2_000L, "Asia/Yerevan",
                    240, "CONFIRMED", "android", 2_000L, "acknowledged-revision", null,
                    "Legacy completed", 3_000L,
                ),
            )
            execSQL(
                """INSERT INTO time_intervals
                    (entryId, workdayId, entryType, activityId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, sourceDeviceId, updatedAt,
                    currentRevisionId, deletedAt, title, syncedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "running-legacy", null, "WORK", null, 4_000L, null, "Asia/Yerevan",
                    240, "CONFIRMED", "android", 4_000L, null, null, "Legacy running", null,
                ),
            )
            execSQL(
                """INSERT INTO entry_revisions
                    (revisionId, entryId, baseRevisionId, changedByDeviceId, sourceDeviceId,
                    updatedAt, entryType, activityId, categoryId, startedAt, endedAt, timeZoneId,
                    timeZoneOffsetMinutes, confirmationState, deletedAt, acknowledged, createdAt, title)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                arrayOf<Any?>(
                    "acknowledged-revision", "completed-legacy", null, "android", "android",
                    2_000L, "WORK", null, null, 1_000L, 2_000L, "Asia/Yerevan", 240,
                    "CONFIRMED", null, 1, 3_000L, "Legacy completed",
                ),
            )
            execSQL("INSERT INTO sync_cursor (id, cursor) VALUES ('cursor', 'kept-cursor')")
            close()
        }

        val migrated = helper.runMigrationsAndValidate(
            databaseName,
            5,
            true,
            DatabaseMigrations.MIGRATION_4_5,
        )
        migrated.query(
            "SELECT categoryId, title, startedAt, endedAt, timeZoneId, timeZoneOffsetMinutes, syncedAt FROM time_intervals WHERE entryId = 'completed-legacy'",
        ).use { cursor ->
            cursor.moveToFirst()
            assertNull(cursor.getString(0))
            assertEquals("Legacy completed", cursor.getString(1))
            assertEquals(1_000L, cursor.getLong(2))
            assertEquals(2_000L, cursor.getLong(3))
            assertEquals("Asia/Yerevan", cursor.getString(4))
            assertEquals(240, cursor.getInt(5))
            assertEquals(3_000L, cursor.getLong(6))
        }
        migrated.query(
            "SELECT categoryId, endedAt FROM time_intervals WHERE entryId = 'running-legacy'",
        ).use { cursor ->
            cursor.moveToFirst()
            assertNull(cursor.getString(0))
            assertNull(cursor.getString(1))
        }
        migrated.query(
            "SELECT categoryId, acknowledged, createdAt FROM entry_revisions WHERE revisionId = 'acknowledged-revision'",
        ).use { cursor ->
            cursor.moveToFirst()
            assertNull(cursor.getString(0))
            assertEquals(1, cursor.getInt(1))
            assertEquals(3_000L, cursor.getLong(2))
        }
        migrated.query("SELECT cursor FROM sync_cursor WHERE id = 'cursor'").use { cursor ->
            cursor.moveToFirst()
            assertEquals("kept-cursor", cursor.getString(0))
        }
        migrated.close()

        var database = Room.databaseBuilder(context, TrackerDatabase::class.java, databaseName)
            .addMigrations(*DatabaseMigrations.ALL)
            .allowMainThreadQueries()
            .build()
        val category = CategorySnapshotEntity("work", "Work", 5, false, 10_000L)
        database.categoryDao().upsert(category)
        database.close()

        database = Room.databaseBuilder(context, TrackerDatabase::class.java, databaseName)
            .addMigrations(*DatabaseMigrations.ALL)
            .allowMainThreadQueries()
            .build()
        assertEquals(category, database.categoryDao().getAllCategories().single())
        assertNull(database.workdayDao().getInterval("completed-legacy")?.categoryId)
        assertNull(database.workdayDao().getInterval("running-legacy")?.categoryId)
        database.close()
        context.deleteDatabase(databaseName)
    }
}
