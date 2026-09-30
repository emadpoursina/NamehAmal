package com.namehamal.tracker.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionCheckInSchedulerTest {
    @Test fun schedulesHourlyUniqueWorkPerRunningSession() {
        assertEquals(60L, SessionCheckInScheduler.INTERVAL_MINUTES)
        assertEquals("session-check-in-entry-1", SessionCheckInScheduler.uniqueWorkName("entry-1"))
    }

    @Test fun sessionReminderNamesWhatIsTrackedAndCanBeConfirmedInOneTap() {
        val body = CheckInNotification.sessionBody("Deep work")
        assertTrue(body.contains("Deep work"))
        assertTrue(body.contains("Confirm", ignoreCase = true))
        assertEquals("Still working", CheckInNotification.ACTION_STILL_WORKING)
        assertTrue(CheckInNotification.SESSION_CHANNEL_ID.isNotBlank())
        assertTrue(CheckInNotification.sessionBody("Deep work") != CheckInNotification.BODY)
    }
}
