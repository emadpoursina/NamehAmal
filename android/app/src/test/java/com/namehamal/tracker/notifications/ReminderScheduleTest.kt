package com.namehamal.tracker.notifications

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderScheduleTest {
    private val zone: ZoneId = ZoneId.of("UTC")

    private fun at(hour: Int, minute: Int = 0, dayOffset: Long = 0): ZonedDateTime =
        ZonedDateTime.of(LocalDate.of(2026, 9, 30).plusDays(dayOffset), LocalTime.of(hour, minute), zone)

    @Test fun normalWindowAnchorsCycleAtOpen() {
        // 09:00-23:00, 1h -> 10:00, 11:00, ... 22:00.
        assertEquals(at(10).toInstant(), ReminderSchedule.nextTrigger(at(9), 540, 1380, 60))
        assertEquals(at(10).toInstant(), ReminderSchedule.nextTrigger(at(9, 30), 540, 1380, 60))
        assertEquals(at(11).toInstant(), ReminderSchedule.nextTrigger(at(10), 540, 1380, 60))
        assertEquals(at(22).toInstant(), ReminderSchedule.nextTrigger(at(21, 30), 540, 1380, 60))
    }

    @Test fun normalWindowStopsAtCloseAndRestartsNextOpening() {
        // After the last trigger (22:00) the next trigger belongs to the next window opening.
        assertEquals(at(10, dayOffset = 1).toInstant(), ReminderSchedule.nextTrigger(at(22, 30), 540, 1380, 60))
        assertEquals(at(10, dayOffset = 1).toInstant(), ReminderSchedule.nextTrigger(at(23), 540, 1380, 60))
        assertEquals(at(10).toInstant(), ReminderSchedule.nextTrigger(at(0), 540, 1380, 60))
    }

    @Test fun preOpenFiresOneCycleAfterOpen() {
        assertEquals(at(10).toInstant(), ReminderSchedule.nextTrigger(at(8), 540, 1380, 60))
    }

    @Test fun exactBoundaryNowIsExcluded() {
        // now == a trigger instant -> the following trigger is returned, never the same instant.
        assertEquals(at(11).toInstant(), ReminderSchedule.nextTrigger(at(10), 540, 1380, 60))
    }

    @Test fun overnightWindowWrapsPastMidnight() {
        // 22:00-06:00, 1h -> 23:00, 00:00, 01:00, ... 05:00.
        assertEquals(at(23).toInstant(), ReminderSchedule.nextTrigger(at(22), 1320, 360, 60))
        assertEquals(
            at(0, dayOffset = 1).toInstant(),
            ReminderSchedule.nextTrigger(at(23), 1320, 360, 60),
        )
        assertEquals(
            at(5).toInstant(),
            ReminderSchedule.nextTrigger(at(4, 30), 1320, 360, 60),
        )
    }

    @Test fun overnightWindowAfterCloseJumpsToNextOpening() {
        assertEquals(at(23).toInstant(), ReminderSchedule.nextTrigger(at(6), 1320, 360, 60))
        assertEquals(at(23).toInstant(), ReminderSchedule.nextTrigger(at(12), 1320, 360, 60))
    }

    @Test fun emptyWindowYieldsNoTrigger() {
        assertNull(ReminderSchedule.nextTrigger(at(9), 540, 540, 60))
        assertNull(ReminderSchedule.nextTrigger(at(12), 0, 0, 60))
    }

    @Test fun windowShorterThanOneIntervalYieldsNoTrigger() {
        assertNull(ReminderSchedule.nextTrigger(at(9), 540, 570, 60)) // 09:00-09:30, 1h
        assertNull(ReminderSchedule.nextTrigger(at(9), 540, 600, 60)) // 09:00-10:00, 1h (close exclusive)
    }

    @Test fun windowExactlyOneIntervalPlusAMinuteFitsOneTrigger() {
        assertEquals(at(10).toInstant(), ReminderSchedule.nextTrigger(at(9), 540, 601, 60))
    }

    @Test fun presetIntervalsAreHonored() {
        assertEquals(at(9, 15).toInstant(), ReminderSchedule.nextTrigger(at(9), 540, 1380, 15))
        assertEquals(at(12).toInstant(), ReminderSchedule.nextTrigger(at(9), 540, 1380, 180))
    }

    @Test fun withinWindowRespectsInclusiveStartAndExclusiveEnd() {
        assertTrue(ReminderSchedule.isWithinWindow(at(9), 540, 1380))
        assertTrue(ReminderSchedule.isWithinWindow(at(22, 59), 540, 1380))
        assertFalse(ReminderSchedule.isWithinWindow(at(23), 540, 1380))
        assertFalse(ReminderSchedule.isWithinWindow(at(8, 59), 540, 1380))
    }

    @Test fun withinWindowHandlesOvernightAndEmptyWindows() {
        assertTrue(ReminderSchedule.isWithinWindow(at(22), 1320, 360))
        assertTrue(ReminderSchedule.isWithinWindow(at(23), 1320, 360))
        assertTrue(ReminderSchedule.isWithinWindow(at(5, 59), 1320, 360))
        assertFalse(ReminderSchedule.isWithinWindow(at(6), 1320, 360))
        assertFalse(ReminderSchedule.isWithinWindow(at(12), 1320, 360))
        assertFalse(ReminderSchedule.isWithinWindow(at(9), 540, 540))
    }
}
