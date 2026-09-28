package com.namehamal.tracker.domain

import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkdayTimelineTest {
    private val start = Instant.parse("2026-03-29T00:30:00Z")

    @Test fun secondActiveWorkdayIsRejected() {
        assertThrows(IllegalStateException::class.java) {
            WorkdayController.requireNoActiveWorkday(true)
        }
        WorkdayController.requireNoActiveWorkday(false)
    }

    @Test fun activityTransitionUsesOneAdjacentInstant() {
        val current = interval("one", "WORK", "planning", start)
        val at = Instant.parse("2026-03-29T01:30:00Z")
        val (closed, opened) = IntervalRules.transition(
            current, "two", "WORK", "writing", at, "Europe/Berlin",
        )
        assertEquals(at, closed.endedAt)
        assertEquals(at, opened.startedAt)
        assertEquals(closed.endedAt, opened.startedAt)
    }

    @Test fun breakIntervalsAreExcludedFromWorkDuration() {
        val work = interval("one", "WORK", "planning", start)
            .copy(endedAt = start.plusSeconds(3600))
        val pause = interval("break", "BREAK", null, start.plusSeconds(3600))
            .copy(endedAt = start.plusSeconds(5400))
        assertEquals(3600L, IntervalRules.workDurationSeconds(listOf(work, pause)))
    }

    @Test fun editSplitAndUnassignedPreservePositiveAdjacentRanges() {
        val original = interval("one", "WORK", "planning", start)
            .copy(endedAt = start.plusSeconds(3600))
        val boundary = start.plusSeconds(1200)
        val (first, second) = IntervalRules.split(original, boundary, "left", "right")
        assertEquals(first.endedAt, second.startedAt)
        val edited = IntervalRules.edit(second, second.startedAt, second.endedAt!!, null)
        assertEquals(null, edited.activityId)
        assertThrows(IllegalArgumentException::class.java) {
            IntervalRules.edit(original, original.endedAt!!, original.startedAt, "planning")
        }
    }

    @Test fun capturedZoneOffsetDoesNotReplaceUtcInstantAcrossDst() {
        val before = Instant.parse("2026-03-29T00:30:00Z")
        val after = Instant.parse("2026-03-29T01:30:00Z")
        assertEquals(60, IntervalRules.offsetMinutesAt(before, "Europe/Berlin"))
        assertEquals(120, IntervalRules.offsetMinutesAt(after, "Europe/Berlin"))
        assertEquals(3600L, after.epochSecond - before.epochSecond)
    }

    @Test fun noStateChangesOccurWithoutExplicitAction() {
        val recorded = interval("one", "WORK", "planning", start)
        assertTrue(recorded.endedAt == null)
        assertFalse(recorded.entryType == "BREAK")
        assertEquals(start, recorded.startedAt)
    }

    private fun interval(id: String, type: String, activity: String?, at: Instant) =
        IntervalRecord(id, "day", type, activity, at, null, "Europe/Berlin", 60)
}
