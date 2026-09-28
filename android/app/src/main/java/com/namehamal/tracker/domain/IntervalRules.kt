package com.namehamal.tracker.domain

import java.time.Instant
import java.time.ZoneId

data class IntervalRecord(
    val entryId: String,
    val workdayId: String,
    val entryType: String,
    val activityId: String?,
    val startedAt: Instant,
    val endedAt: Instant?,
    val timeZoneId: String,
    val timeZoneOffsetMinutes: Int,
)

object IntervalRules {
    fun close(current: IntervalRecord, at: Instant): IntervalRecord {
        require(current.endedAt == null) { "Interval is already closed." }
        require(at > current.startedAt) { "An interval must have a positive duration." }
        return current.copy(endedAt = at)
    }

    fun transition(
        current: IntervalRecord,
        newEntryId: String,
        entryType: String,
        activityId: String?,
        at: Instant,
        zoneId: String,
    ): Pair<IntervalRecord, IntervalRecord> {
        require(entryType == WORK || entryType == BREAK) { "Unknown interval type." }
        require(entryType != BREAK || activityId == null) { "Breaks cannot have an activity." }
        val zone = ZoneId.of(zoneId)
        val next = IntervalRecord(
            entryId = newEntryId,
            workdayId = current.workdayId,
            entryType = entryType,
            activityId = activityId,
            startedAt = at,
            endedAt = null,
            timeZoneId = zoneId,
            timeZoneOffsetMinutes = zone.rules.getOffset(at).totalSeconds / 60,
        )
        return close(current, at) to next
    }

    fun edit(
        original: IntervalRecord,
        startedAt: Instant,
        endedAt: Instant,
        activityId: String?,
    ): IntervalRecord {
        require(endedAt > startedAt) { "An interval must have a positive duration." }
        require(original.entryType != BREAK || activityId == null) { "Breaks cannot have an activity." }
        return original.copy(
            startedAt = startedAt,
            endedAt = endedAt,
            activityId = activityId,
            timeZoneOffsetMinutes = offsetMinutesAt(startedAt, original.timeZoneId),
        )
    }

    fun split(
        original: IntervalRecord,
        boundary: Instant,
        firstId: String,
        secondId: String,
    ): Pair<IntervalRecord, IntervalRecord> {
        val end = requireNotNull(original.endedAt) { "Only a closed interval can be split." }
        require(boundary > original.startedAt && boundary < end) { "Split point must be inside the interval." }
        val first = original.copy(entryId = firstId, endedAt = boundary)
        val second = original.copy(
            entryId = secondId,
            startedAt = boundary,
            timeZoneOffsetMinutes = offsetMinutesAt(boundary, original.timeZoneId),
        )
        return first to second
    }

    fun workDurationSeconds(intervals: List<IntervalRecord>): Long = intervals
        .asSequence()
        .filter { it.entryType == WORK }
        .mapNotNull { record -> record.endedAt?.let { it.epochSecond - record.startedAt.epochSecond } }
        .sum()

    fun offsetMinutesAt(instant: Instant, zoneId: String): Int =
        ZoneId.of(zoneId).rules.getOffset(instant).totalSeconds / 60

    const val WORK = "WORK"
    const val BREAK = "BREAK"
}
