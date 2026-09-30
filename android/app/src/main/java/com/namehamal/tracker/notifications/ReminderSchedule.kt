package com.namehamal.tracker.notifications

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Pure, timezone-aware reminder scheduling math (research decision 4, contract
 * `reminder-scheduling.md`).
 *
 * The active window is `[start, end)` in the device's current local zone. The cycle is anchored at
 * the window opening: the first trigger is `open + interval`, and triggers step by `interval` while
 * strictly before the close. An empty window (`start == end`) and a window shorter than one interval
 * produce no trigger. Overnight windows (`start > end`) wrap past midnight.
 */
object ReminderSchedule {

    /** True when [now] falls inside the `[start, end)` local window; an empty window is never open. */
    fun isWithinWindow(now: ZonedDateTime, windowStartMinutes: Int, windowEndMinutes: Int): Boolean {
        if (windowStartMinutes == windowEndMinutes) return false
        val minutes = now.hour * 60 + now.minute
        return if (windowStartMinutes < windowEndMinutes) {
            minutes >= windowStartMinutes && minutes < windowEndMinutes
        } else {
            minutes >= windowStartMinutes || minutes < windowEndMinutes
        }
    }

    /**
     * The next trigger strictly after [now], or null when no trigger exists (empty window, window
     * shorter than one interval, or a non-positive interval).
     */
    fun nextTrigger(
        now: ZonedDateTime,
        windowStartMinutes: Int,
        windowEndMinutes: Int,
        intervalMinutes: Int,
    ): Instant? {
        if (intervalMinutes <= 0) return null
        if (windowStartMinutes == windowEndMinutes) return null
        val zone = now.zone
        val nowInstant = now.toInstant()
        // Check the previous day (overnight continuation), the current day, and the next day.
        for (dayOffset in -1L..1L) {
            val opening = openingFor(now.toLocalDate().plusDays(dayOffset), windowStartMinutes, windowEndMinutes)
            val close = closingFor(now.toLocalDate().plusDays(dayOffset), windowStartMinutes, windowEndMinutes)
            var candidate = opening.plusMinutes(intervalMinutes.toLong())
            while (candidate.isBefore(close)) {
                val zoned = candidate.atZone(zone)
                if (zoned.toInstant().isAfter(nowInstant)) return zoned.toInstant()
                candidate = candidate.plusMinutes(intervalMinutes.toLong())
            }
        }
        return null
    }

    /** Convenience overload that reads the zone from [now]. */
    fun nextTrigger(
        now: Instant,
        zone: ZoneId,
        windowStartMinutes: Int,
        windowEndMinutes: Int,
        intervalMinutes: Int,
    ): Instant? = nextTrigger(now.atZone(zone), windowStartMinutes, windowEndMinutes, intervalMinutes)

    private fun openingFor(date: LocalDate, windowStartMinutes: Int, windowEndMinutes: Int): LocalDateTime =
        LocalDateTime.of(date, localTime(windowStartMinutes))

    private fun closingFor(date: LocalDate, windowStartMinutes: Int, windowEndMinutes: Int): LocalDateTime {
        val closeDate = if (windowStartMinutes < windowEndMinutes) date else date.plusDays(1)
        return LocalDateTime.of(closeDate, localTime(windowEndMinutes))
    }

    private fun localTime(minutesOfDay: Int): LocalTime =
        LocalTime.of(minutesOfDay / 60, minutesOfDay % 60)
}
