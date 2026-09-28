package com.namehamal.tracker.notifications

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckInNotificationTest {
    @Test fun lockScreenCopyIsGenericAndHasOneTapConfirmation() {
        assertFalse(CheckInNotification.BODY.contains("activity", ignoreCase = true))
        assertFalse(CheckInNotification.BODY.contains("project", ignoreCase = true))
        assertTrue(CheckInNotification.ACTION_SAME_ACTIVITY.isNotBlank())
        assertTrue(CheckInNotification.PERMISSION_EXPLANATION.contains("timeline", ignoreCase = true))
    }
}
