package com.namehamal.tracker.domain

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SimpleSessionRulesTest {
    private val zoneId = "Asia/Yerevan"
    private val now = Instant.parse("2026-09-27T12:00:00Z")

    @Test
    fun trimsTitlesAndRejectsBlankInput() {
        assertEquals("Planning", SessionRules.requireTitle("  Planning  "))
        assertThrows(IllegalArgumentException::class.java) {
            SessionRules.requireTitle(" \t ")
        }
    }

    @Test
    fun acceptsCompletedPastIntervalAndRejectsNonPositiveDuration() {
        val saved = SessionRules.completed(
            title = "Planning",
            startedAtLocal = "2026-04-10 08:15",
            endedAtLocal = "2026-04-10 09:15",
            zoneId = zoneId,
        )
        assertEquals(Instant.parse("2026-04-10T04:15:00Z"), saved.startedAt)
        assertEquals(Instant.parse("2026-04-10T05:15:00Z"), saved.endedAt)
        assertEquals(240, saved.timeZoneOffsetMinutes)

        assertThrows(IllegalArgumentException::class.java) {
            SessionRules.completed("Planning", "2026-04-10 09:15", "2026-04-10 09:15", zoneId)
        }
        assertThrows(IllegalArgumentException::class.java) {
            SessionRules.completed("Planning", "2026-04-10 09:15", "2026-04-10 08:15", zoneId)
        }
    }

    @Test
    fun rejectsFutureRunningStartsButAcceptsPastOrCurrentStarts() {
        val past = SessionRules.running("Focus", "2026-09-27 15:59", zoneId, now)
        assertEquals(Instant.parse("2026-09-27T11:59:00Z"), past.startedAt)
        assertThrows(IllegalArgumentException::class.java) {
            SessionRules.running("Focus", "2026-09-27 16:01", zoneId, now)
        }
    }

    @Test
    fun reportsMissingOrInvalidLocalTimes() {
        assertThrows(IllegalArgumentException::class.java) {
            SessionRules.completed(" ", "2026-09-27 14:00", "2026-09-27 15:00", zoneId)
        }
        assertThrows(IllegalArgumentException::class.java) {
            SessionRules.running("Focus", "not a date", zoneId, now)
        }
    }
}
