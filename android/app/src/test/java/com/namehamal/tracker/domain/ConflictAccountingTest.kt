package com.namehamal.tracker.domain

import com.namehamal.tracker.data.sync.IntervalOverlapCalculator
import com.namehamal.tracker.data.sync.IntervalOverlapCalculator.Entry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Overlap accounting: union counting, unresolved exclusion, resolution, undo (T034). */
class ConflictAccountingTest {
    private val hour = 3_600_000L
    private val base = 1_700_000_000_000L

    private fun entry(
        id: String,
        activity: String?,
        startHours: Long,
        endHours: Long,
        type: String = "WORK",
    ) = Entry(id, activity, type, base + startHours * hour, base + endHours * hour)

    @Test
    fun exactDuplicatesCountOnce() {
        val entries = listOf(entry("a", "act-1", 0, 1), entry("b", "act-1", 0, 1))
        val overlaps = IntervalOverlapCalculator.findOverlaps(entries)
        assertEquals(1, overlaps.size)
        assertTrue(overlaps[0].sameActivity)
        val totals = IntervalOverlapCalculator.totalsByActivity(entries, emptyList())
        assertEquals(3600L, totals["act-1"])
    }

    @Test
    fun sameActivityUnionCountsSharedMinutesOnce() {
        val entries = listOf(entry("a", "act-1", 0, 2), entry("b", "act-1", 1, 3))
        val totals = IntervalOverlapCalculator.totalsByActivity(entries, emptyList())
        assertEquals(3 * 3600L, totals["act-1"])
    }

    @Test
    fun differentActivityOverlapIsReportedForReview() {
        val overlaps = IntervalOverlapCalculator.findOverlaps(
            listOf(entry("a", "act-1", 0, 2), entry("b", "act-2", 1, 3)),
        )
        assertEquals(1, overlaps.size)
        assertTrue(!overlaps[0].sameActivity)
        assertEquals(base + hour, overlaps[0].startMs)
        assertEquals(base + 2 * hour, overlaps[0].endMs)
    }

    @Test
    fun unresolvedDifferentActivitySharedTimeIsExcluded() {
        val entries = listOf(entry("a", "act-1", 0, 2), entry("b", "act-2", 1, 3))
        val exclusion = (base + hour) to (base + 2 * hour)
        val totals = IntervalOverlapCalculator.totalsByActivity(entries, listOf(exclusion))
        assertEquals(3600L, totals["act-1"])
        assertEquals(3600L, totals["act-2"])
    }

    @Test
    fun resolutionRestoresCountedTimeAndUndoReExcludesIt() {
        val entries = listOf(entry("a", "act-1", 0, 2), entry("b", "act-2", 1, 3))
        val exclusion = (base + hour) to (base + 2 * hour)
        // Resolved: exclusion lifted.
        val resolved = IntervalOverlapCalculator.totalsByActivity(entries, emptyList())
        assertEquals(2 * 3600L, resolved["act-1"])
        // Undo: exclusion back.
        val undone = IntervalOverlapCalculator.totalsByActivity(entries, listOf(exclusion))
        assertEquals(3600L, undone["act-1"])
        assertEquals(3600L, undone["act-2"])
    }

    @Test
    fun breaksAndTombstonesNeverCount() {
        val entries = listOf(
            entry("w", "act-1", 0, 2),
            entry("br", null, 1, 2, type = "BREAK"),
            Entry(entryId = "gone", activityId = "act-1", entryType = "WORK", startedAt = base, endedAt = base + 4 * hour, deleted = true),
        )
        val totals = IntervalOverlapCalculator.totalsByActivity(entries, emptyList())
        assertEquals(2 * 3600L, totals["act-1"])
        // Breaks never create conflicts.
        assertTrue(
            IntervalOverlapCalculator.findOverlaps(
                listOf(entry("w", "act-1", 0, 2), entry("br", "act-1", 1, 2, type = "BREAK")),
            ).isEmpty(),
        )
    }

    @Test
    fun adjacentIntervalsDoNotOverlap() {
        val overlaps = IntervalOverlapCalculator.findOverlaps(
            listOf(entry("a", "act-1", 0, 1), entry("b", "act-2", 1, 2)),
        )
        assertTrue(overlaps.isEmpty())
    }
}
