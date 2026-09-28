package com.namehamal.tracker.data.sync

/** Pure overlap accounting mirroring the host rules (T039). Shared minutes are never double-counted. */
object IntervalOverlapCalculator {
    data class Entry(
        val entryId: String,
        val activityId: String?,
        val entryType: String,
        val startedAt: Long,
        val endedAt: Long,
        val deleted: Boolean = false,
    )

    data class Overlap(
        val entryIdA: String,
        val entryIdB: String,
        val sameActivity: Boolean,
        val startMs: Long,
        val endMs: Long,
    )

    private fun usable(entry: Entry): Boolean =
        !entry.deleted && entry.entryType != "BREAK" && entry.endedAt > entry.startedAt

    fun findOverlaps(entries: List<Entry>): List<Overlap> {
        val usableEntries = entries.filter(::usable)
        val result = ArrayList<Overlap>()
        for (i in usableEntries.indices) {
            for (j in i + 1 until usableEntries.size) {
                val a = usableEntries[i]
                val b = usableEntries[j]
                if (a.entryId == b.entryId) continue
                val start = maxOf(a.startedAt, b.startedAt)
                val end = minOf(a.endedAt, b.endedAt)
                if (end <= start) continue
                result.add(
                    Overlap(
                        entryIdA = a.entryId,
                        entryIdB = b.entryId,
                        sameActivity = a.activityId != null && a.activityId == b.activityId,
                        startMs = start,
                        endMs = end,
                    ),
                )
            }
        }
        return result
    }

    /** Union duration in seconds: same-activity shared time counts once. */
    fun unionSeconds(ranges: List<Pair<Long, Long>>): Long {
        val sorted = ranges.sortedBy { it.first }
        var total = 0L
        var cursorStart: Long? = null
        var cursorEnd = 0L
        for ((start, end) in sorted) {
            if (cursorStart == null) {
                cursorStart = start
                cursorEnd = end
            } else if (start <= cursorEnd) {
                cursorEnd = maxOf(cursorEnd, end)
            } else {
                total += cursorEnd - cursorStart
                cursorStart = start
                cursorEnd = end
            }
        }
        if (cursorStart != null) total += cursorEnd - cursorStart
        return total / 1000
    }

    /**
     * Work seconds per activity bucket after removing unresolved
     * different-activity shared spans. Breaks and tombstones never count.
     */
    fun totalsByActivity(
        entries: List<Entry>,
        unresolvedExclusions: List<Pair<Long, Long>>,
    ): Map<String, Long> {
        val buckets = LinkedHashMap<String, MutableList<Pair<Long, Long>>>()
        for (entry in entries) {
            if (!usable(entry)) continue
            val bucket = entry.activityId ?: "UNASSIGNED"
            buckets.getOrPut(bucket) { ArrayList() }.add(entry.startedAt to entry.endedAt)
        }
        return buckets.mapValues { (_, ranges) -> unionSeconds(subtract(ranges, unresolvedExclusions)) }
    }

    private fun subtract(
        base: List<Pair<Long, Long>>,
        exclusions: List<Pair<Long, Long>>,
    ): List<Pair<Long, Long>> {
        var result = union(base)
        for (exclusion in union(exclusions)) {
            val next = ArrayList<Pair<Long, Long>>()
            for ((start, end) in result) {
                if (exclusion.second <= start || exclusion.first >= end) {
                    next.add(start to end)
                    continue
                }
                if (exclusion.first > start) next.add(start to exclusion.first)
                if (exclusion.second < end) next.add(exclusion.second to end)
            }
            result = next
        }
        return result
    }

    private fun union(ranges: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        val sorted = ranges.sortedBy { it.first }
        val merged = ArrayList<Pair<Long, Long>>()
        for ((start, end) in sorted) {
            val last = merged.lastOrNull()
            if (last != null && start <= last.second) {
                merged[merged.lastIndex] = last.first to maxOf(last.second, end)
            } else {
                merged.add(start to end)
            }
        }
        return merged
    }
}
