package com.namehamal.tracker.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckInSchedulerTest {
    @Test fun usesUniqueHourlyWorkForAnActiveWorkday() {
        assertEquals(60L, CheckInScheduler.INTERVAL_MINUTES)
        assertEquals("workday-check-in-day-1", CheckInScheduler.uniqueWorkName("day-1"))
    }

    @Test fun staleWorkdayIsIgnoredAndMissedCheckInDoesNotCloseAnInterval() {
        assertTrue(CheckInPolicy.shouldNotify("day-1", "day-1"))
        assertFalse(CheckInPolicy.shouldNotify("day-2", "day-1"))
        assertEquals("UNCONFIRMED", CheckInPolicy.confirmationForMissedCheckIn())
    }
}
