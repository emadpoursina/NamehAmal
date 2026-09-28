package com.namehamal.tracker.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SimpleSessionPersistenceTest {
    private lateinit var database: TrackerDatabase
    private val databaseName = "simple-session-persistence-test.db"

    @Before fun createDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.deleteDatabase(databaseName)
        database = openDatabase(context)
    }

    @After fun closeDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database.close()
        context.deleteDatabase(databaseName)
    }

    @Test fun completedSessionAndDeviceZoneSurviveDatabaseReopen() = runBlocking {
        val repository = TimelineRepository(database, "test-device")
        val completed = repository.createCompletedSession(
            title = "Planning",
            startedAtLocal = "2026-04-10 08:15",
            endedAtLocal = "2026-04-10 09:15",
            zoneId = "Asia/Yerevan",
            now = Instant.parse("2026-09-27T12:00:00Z"),
        )
        assertNull(completed.workdayId)
        assertEquals("Planning", completed.title)
        assertEquals("Asia/Yerevan", completed.timeZoneId)
        assertEquals(240, completed.timeZoneOffsetMinutes)
        assertEquals(Instant.parse("2026-04-10T04:15:00Z").toEpochMilli(), completed.startedAt)
        assertEquals(Instant.parse("2026-04-10T05:15:00Z").toEpochMilli(), completed.endedAt)
        assertNull(completed.syncedAt)

        database.close()
        database = openDatabase(ApplicationProvider.getApplicationContext())
        val reopened = database.workdayDao().getInterval(completed.entryId)
        assertNotNull(reopened)
        assertEquals(completed, reopened)
    }

    @Test fun runningSessionSurvivesReopenAndCannotBeReplaced() = runBlocking {
        val repository = TimelineRepository(database, "test-device")
        val start = Instant.parse("2026-09-27T11:00:00Z")
        val running = repository.startSession(
            title = "Focus",
            startedAtLocal = "2026-09-27 15:00",
            zoneId = "Asia/Yerevan",
            now = Instant.parse("2026-09-27T12:00:00Z"),
        )
        assertNull(running.endedAt)
        assertEquals(start.toEpochMilli(), running.startedAt)

        database.close()
        database = openDatabase(ApplicationProvider.getApplicationContext())
        val reopenedRepository = TimelineRepository(database, "test-device")
        assertEquals(running, database.workdayDao().getRunningInterval())
        val rejected = runCatching {
            reopenedRepository.startSession(
                "Another", "2026-09-27 15:30", "Asia/Yerevan", Instant.parse("2026-09-27T12:00:00Z"),
            )
        }
        assertNotNull(rejected.exceptionOrNull())
        assertEquals(running.entryId, database.workdayDao().getRunningInterval()?.entryId)

        val stopped = reopenedRepository.stopSession(
            running.entryId,
            Instant.parse("2026-09-27T12:30:00Z"),
        )
        assertEquals(Instant.parse("2026-09-27T12:30:00Z").toEpochMilli(), stopped.endedAt)
    }

    @Test fun allDatesFeedHasStableNewestFirstOrderAndRecentDistinctTitleSuggestions() = runBlocking {
        val repository = TimelineRepository(database, "test-device")
        val now = Instant.parse("2026-09-27T12:00:00Z")
        repository.createCompletedSession("Planning", "2026-04-10 08:00", "2026-04-10 08:30", "UTC", now)
        repository.createCompletedSession("Writing", "2026-04-10 09:00", "2026-04-10 09:30", "UTC", now)
        repository.createCompletedSession("Planning", "2026-04-10 10:00", "2026-04-10 10:30", "UTC", now)
        repository.createCompletedSession("Same time A", "2026-04-11 10:00", "2026-04-11 10:30", "UTC", now)
        repository.createCompletedSession("Same time B", "2026-04-11 10:00", "2026-04-11 10:30", "UTC", now)

        val feed = repository.observeEvents().first()
        val tied = feed.filter { it.startedAt == feed.first().startedAt }
        assertEquals(tied.sortedByDescending { it.entryId }.map { it.entryId }, tied.map { it.entryId })
        assertEquals(listOf("Same time A", "Same time B", "Planning", "Writing"), repository.observeTitleSuggestions().first())
        assertTrue(feed.zipWithNext().all { (newer, older) ->
            newer.startedAt > older.startedAt ||
                (newer.startedAt == older.startedAt && newer.entryId >= older.entryId)
        })
    }

    private fun openDatabase(context: Context) = Room.databaseBuilder(
        context,
        TrackerDatabase::class.java,
        databaseName,
    ).addMigrations(*DatabaseMigrations.ALL).allowMainThreadQueries().build()
}
