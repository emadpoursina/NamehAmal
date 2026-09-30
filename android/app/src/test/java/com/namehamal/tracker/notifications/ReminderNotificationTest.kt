package com.namehamal.tracker.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderNotificationTest {

    @Test fun contentIsNeutralAndNamesNoTrackedActivity() {
        val content = ReminderNotification.content()
        assertEquals("Time check-in", content.title)
        assertEquals("What have you been working on?", content.body)
        assertFalse(content.title.contains("session", ignoreCase = true))
        assertFalse(content.body.contains("session", ignoreCase = true))
        assertFalse(content.body.contains("activity", ignoreCase = true))
        assertFalse(content.body.contains("project", ignoreCase = true))
    }

    @Test fun contentOffersExactlyOneOpenAppAction() {
        val content = ReminderNotification.content()
        assertEquals(listOf("Open app"), content.actions)
        assertEquals(1, content.actions.size)
    }

    @Test fun testTriggerPostsImmediatelyWhenPermitted() {
        var posts = 0
        val posted = ReminderNotification.testTrigger(permitted = true) { posts += 1; true }
        assertTrue(posted)
        assertEquals(1, posts)
    }

    @Test fun testTriggerDoesNothingWhenNotPermitted() {
        var posts = 0
        val posted = ReminderNotification.testTrigger(permitted = false) { posts += 1; true }
        assertFalse(posted)
        assertEquals(0, posts)
    }

    @Test fun testTriggerTouchesNeitherSettingsNorScheduledWork() {
        // The trigger only invokes the supplied poster; it holds no settings or scheduler reference,
        // so enabled state, cycle, window, and scheduled work cannot change (FR-013).
        val calls = mutableListOf<String>()
        ReminderNotification.testTrigger(permitted = true) {
            calls += "post"
            true
        }
        assertEquals(listOf("post"), calls)
    }
}
