package com.namehamal.tracker.domain

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle

/** Shared validation and device-local timestamp conversion for direct sessions. */
object SessionRules {
    private val localDateTimeFormatter = DateTimeFormatter
        .ofPattern("uuuu-MM-dd HH:mm")
        .withResolverStyle(ResolverStyle.STRICT)

    data class SessionTimes(
        val title: String,
        val startedAt: Instant,
        val endedAt: Instant?,
        val timeZoneId: String,
        val timeZoneOffsetMinutes: Int,
    )

    fun requireTitle(title: String): String = title.trim().also {
        require(it.isNotEmpty()) { "Enter an activity title." }
    }

    fun completed(
        title: String,
        startedAtLocal: String,
        endedAtLocal: String,
        zoneId: String,
    ): SessionTimes {
        val zone = ZoneId.of(zoneId)
        val start = parseLocalDateTime(startedAtLocal, zone)
        val end = parseLocalDateTime(endedAtLocal, zone)
        require(end > start) { "End time must be later than start time." }
        return sessionTimes(title, start, end, zone)
    }

    fun running(
        title: String,
        startedAtLocal: String,
        zoneId: String,
        now: Instant,
    ): SessionTimes {
        val zone = ZoneId.of(zoneId)
        val start = parseLocalDateTime(startedAtLocal, zone)
        require(start <= now) { "A running session cannot start in the future." }
        return sessionTimes(title, start, null, zone)
    }

    fun stop(startedAt: Instant, endedAt: Instant) {
        require(endedAt > startedAt) { "End time must be later than start time." }
    }

    fun formatLocalDateTime(instant: Instant, zoneId: ZoneId): String =
        localDateTimeFormatter.format(instant.atZone(zoneId).toLocalDateTime())

    private fun sessionTimes(
        title: String,
        startedAt: Instant,
        endedAt: Instant?,
        zone: ZoneId,
    ) = SessionTimes(
        title = requireTitle(title),
        startedAt = startedAt,
        endedAt = endedAt,
        timeZoneId = zone.id,
        timeZoneOffsetMinutes = IntervalRules.offsetMinutesAt(startedAt, zone.id),
    )

    private fun parseLocalDateTime(value: String, zone: ZoneId): Instant {
        val local = try {
            LocalDateTime.parse(value.trim(), localDateTimeFormatter)
        } catch (_: Exception) {
            throw IllegalArgumentException("Enter a date and time as YYYY-MM-DD HH:MM.")
        }
        val offsets = zone.rules.getValidOffsets(local)
        require(offsets.isNotEmpty()) {
            "That local time does not exist in ${zone.id}; choose another time."
        }
        // During a clock-change overlap, select the earlier occurrence deterministically.
        return local.toInstant(offsets.first())
    }
}
