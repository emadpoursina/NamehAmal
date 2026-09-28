package com.namehamal.tracker.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TimelinePersistenceTest {
    private lateinit var database: TrackerDatabase

    @Before fun createDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.deleteDatabase("tracker-persistence-test.db")
        database = openDatabase(context)
    }

    @After fun closeDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database.close()
        context.deleteDatabase("tracker-persistence-test.db")
    }

    @Test fun activeWorkdayAndTimelineAreStoredLocallyWithoutNetwork() = runBlocking {
        val start = Instant.parse("2026-09-26T08:00:00Z").toEpochMilli()
        val day = WorkdayEntity("day", start, null, "Asia/Yerevan", "ACTIVE")
        val entry = TimeIntervalEntity(
            "entry", "day", "WORK", "activity", start, null,
            "Asia/Yerevan", 240, "CONFIRMED", "device", 1,
        )
        database.workdayDao().insertWorkday(day)
        database.workdayDao().insertInterval(entry)
        database.close()
        database = openDatabase(ApplicationProvider.getApplicationContext())

        assertNotNull(database.workdayDao().getActiveWorkday())
        assertEquals(entry.entryId, database.workdayDao().getIntervals("day").single().entryId)
    }

    @Test fun explicitTransitionsStayAdjacentAndRejectASecondActiveWorkday() = runBlocking {
        val repository = TimelineRepository(database, "test-device")
        val start = Instant.parse("2026-09-26T08:00:00Z")
        val workday = repository.startWorkday(start, null, java.time.ZoneId.of("Asia/Yerevan"))
        val duplicateStart = runCatching {
            repository.startWorkday(start.plusSeconds(1), null, java.time.ZoneId.of("Asia/Yerevan"))
        }
        assertTrue(duplicateStart.isFailure)

        repository.changeActivity(null, start.plusSeconds(3_600), java.time.ZoneId.of("Asia/Yerevan"))
        repository.startBreak(start.plusSeconds(7_200), java.time.ZoneId.of("Asia/Yerevan"))
        repository.resumeActivity(null, start.plusSeconds(9_000), java.time.ZoneId.of("Asia/Yerevan"))
        repository.endWorkday(start.plusSeconds(10_800))

        val rows = database.workdayDao().getIntervals(workday.workdayId)
        assertEquals(listOf("WORK", "WORK", "BREAK", "WORK"), rows.map { it.entryType })
        assertTrue(rows.zipWithNext().all { (left, right) -> left.endedAt == right.startedAt })
        assertEquals(start.plusSeconds(7_200).toEpochMilli(), rows[2].startedAt)
        assertEquals(start.plusSeconds(9_000).toEpochMilli(), rows[2].endedAt)
        assertEquals("ENDED", database.workdayDao().getWorkday(workday.workdayId)?.state)
    }

    private fun openDatabase(context: Context) = Room.databaseBuilder(
        context, TrackerDatabase::class.java, "tracker-persistence-test.db",
    ).addMigrations(*DatabaseMigrations.ALL).allowMainThreadQueries().build()
}
