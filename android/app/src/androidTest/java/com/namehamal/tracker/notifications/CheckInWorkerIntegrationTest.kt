package com.namehamal.tracker.notifications

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.data.local.TrackerDatabase
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckInWorkerIntegrationTest {
    private lateinit var database: TrackerDatabase
    private lateinit var repository: TimelineRepository

    @Before fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database = Room.inMemoryDatabaseBuilder(context, TrackerDatabase::class.java)
            .allowMainThreadQueries().build()
        repository = TimelineRepository(database, "test-device")
    }

    @After fun tearDown() = database.close()

    @Test fun workerRechecksTheWorkdayAndMissedReminderDoesNotCloseItsInterval() = runBlocking {
        val now = Instant.now()
        val workday = repository.startWorkday(now.minusSeconds(7_200), null, ZoneId.systemDefault())
        try {
            repository.recordCheckIn(workday.workdayId, now.minusSeconds(3_600))
            assertTrue(CheckInWorker.runCheckIn(repository, workday.workdayId, now) { false })
            val markerRows = database.checkInDao().getForWorkday(workday.workdayId)
            val interval = database.workdayDao().getIntervals(workday.workdayId).single()
            assertEquals("MISSED", markerRows.first().state)
            assertEquals("UNCONFIRMED", interval.confirmationState)
            assertNull(interval.endedAt)
        } finally {
            repository.endWorkday(now.plusSeconds(1))
        }
    }

    @Test fun staleWorkdayCannotCreateAReminder() = runBlocking {
        assertEquals(false, CheckInWorker.runCheckIn(repository, "stale-workday", Instant.now()) { false })
        assertNull(database.workdayDao().getActiveWorkday())
    }

    @Test fun sameActivityConfirmsInPlaceAndQuickFlowActionsUseNormalTransitions() = runBlocking {
        val now = Instant.now()
        val zone = ZoneId.systemDefault()
        val workday = repository.startWorkday(now.minusSeconds(3_600), null, zone)
        val checkInId = requireNotNull(repository.recordCheckIn(workday.workdayId, now))
        val before = database.workdayDao().getIntervals(workday.workdayId).single()

        assertTrue(repository.confirmCheckIn(checkInId))
        val confirmed = database.workdayDao().getIntervals(workday.workdayId).single()
        assertNull(confirmed.endedAt)
        assertEquals(before.startedAt, confirmed.startedAt)
        assertEquals("CONFIRMED", confirmed.confirmationState)

        repository.changeActivity(null, now.plusSeconds(60), zone)
        repository.startBreak(now.plusSeconds(120), zone)
        repository.resumeActivity(null, now.plusSeconds(180), zone)
        repository.endWorkday(now.plusSeconds(240))
        val rows = database.workdayDao().getIntervals(workday.workdayId)
        assertEquals(listOf("WORK", "WORK", "BREAK", "WORK"), rows.map { it.entryType })
        assertTrue(rows.zipWithNext().all { (left, right) -> left.endedAt == right.startedAt })
    }
}
