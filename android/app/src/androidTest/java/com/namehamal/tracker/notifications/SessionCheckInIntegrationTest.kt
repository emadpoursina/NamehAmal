package com.namehamal.tracker.notifications

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.data.local.TrackerDatabase
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SessionCheckInIntegrationTest {
    private lateinit var database: TrackerDatabase
    private lateinit var repository: TimelineRepository

    @Before fun setUp() = runBlocking {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, TrackerDatabase::class.java)
            .allowMainThreadQueries().build()
        database.categoryDao().upsert(CategorySnapshotEntity("test-category", "Test", 0, false, 1L))
        repository = TimelineRepository(database, "test-device")
    }

    @After fun tearDown() = database.close()

    @Test fun reminderConfirmsRunningSessionInPlace() = runBlocking {
        val now = Instant.now()
        val running = repository.startSession(
            title = "Deep work",
            startedAtLocal = "2026-09-27 15:00",
            categoryId = "test-category",
            zoneId = "UTC",
            now = now,
        )

        val checkIn = requireNotNull(repository.recordSessionCheckIn(running.entryId, now))
        assertEquals("Deep work", checkIn.title)
        assertTrue(repository.confirmSessionCheckIn(checkIn.checkInId))
        val after = requireNotNull(database.workdayDao().getInterval(running.entryId))
        assertNull(after.endedAt)
        assertEquals("CONFIRMED", after.confirmationState)
        assertEquals("CONFIRMED", database.checkInDao().get(checkIn.checkInId)?.state)
    }

    @Test fun ignoredReminderLeavesSessionRunningButUnconfirmed() = runBlocking {
        val now = Instant.now()
        val running = repository.startSession(
            title = "Deep work",
            startedAtLocal = "2026-09-27 15:00",
            categoryId = "test-category",
            zoneId = "UTC",
            now = now,
        )

        assertTrue(SessionCheckInWorker.runSessionCheckIn(repository, running.entryId, now) { false })
        assertFalse(database.checkInDao().getForEntry(running.entryId).isEmpty())
        val after = requireNotNull(database.workdayDao().getInterval(running.entryId))
        assertEquals("MISSED", database.checkInDao().getForEntry(running.entryId).single().state)
        assertEquals("UNCONFIRMED", after.confirmationState)
        assertNull(after.endedAt)
    }

    @Test fun staleReminderForAStoppedSessionCannotFire() = runBlocking {
        val now = Instant.now()
        val running = repository.startSession(
            title = "Deep work",
            startedAtLocal = "2026-09-27 15:00",
            categoryId = "test-category",
            zoneId = "UTC",
            now = now,
        )
        repository.stopSession(running.entryId, now.plusSeconds(60))

        assertFalse(SessionCheckInWorker.runSessionCheckIn(repository, running.entryId, now) { false })
        assertNull(repository.recordSessionCheckIn(running.entryId, now))
    }
}
