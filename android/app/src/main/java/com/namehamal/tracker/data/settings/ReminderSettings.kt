package com.namehamal.tracker.data.settings

/**
 * The reminder cycle presets offered in Settings. Custom intervals are out of scope
 * (FR-004); the stored interval must be one of these values.
 */
enum class ReminderCycle(val minutes: Int) {
    MINUTES_15(15),
    MINUTES_30(30),
    HOUR_1(60),
    HOURS_2(120),
    HOURS_3(180),
    ;

    val label: String
        get() = when (this) {
            MINUTES_15 -> "15 minutes"
            MINUTES_30 -> "30 minutes"
            HOUR_1 -> "1 hour"
            HOURS_2 -> "2 hours"
            HOURS_3 -> "3 hours"
        }

    companion object {
        val DEFAULT: ReminderCycle = HOUR_1

        fun fromMinutes(minutes: Int): ReminderCycle? = entries.firstOrNull { it.minutes == minutes }
    }
}

/**
 * Device-local reminder configuration (FR-003..FR-005, FR-010).
 *
 * The active window is stored as local wall-clock minutes since midnight and evaluated in the
 * device's current zone at each scheduling decision, so time-zone and DST changes are honored
 * (FR-011). The window is `[windowStartMinutes, windowEndMinutes)`; start equal to end is an
 * empty window that delivers nothing (FR-008).
 */
data class ReminderSettings(
    val enabled: Boolean = false,
    val intervalMinutes: Int = ReminderCycle.DEFAULT.minutes,
    val windowStartMinutes: Int = DEFAULT_WINDOW_START_MINUTES,
    val windowEndMinutes: Int = DEFAULT_WINDOW_END_MINUTES,
) {
    val cycle: ReminderCycle get() = ReminderCycle.fromMinutes(intervalMinutes) ?: ReminderCycle.DEFAULT

    val windowStartLabel: String get() = formatMinutesOfDay(windowStartMinutes)

    val windowEndLabel: String get() = formatMinutesOfDay(windowEndMinutes)

    /** An empty window (`start == end`) never delivers a reminder (FR-008). */
    val hasEmptyWindow: Boolean get() = windowStartMinutes == windowEndMinutes

    companion object {
        const val DEFAULT_WINDOW_START_MINUTES = 540 // 09:00
        const val DEFAULT_WINDOW_END_MINUTES = 1380 // 23:00
        const val MINUTES_IN_DAY = 1440

        val PRESET_INTERVALS: Set<Int> = ReminderCycle.entries.mapTo(mutableSetOf()) { it.minutes }

        fun isValidInterval(minutes: Int): Boolean = minutes in PRESET_INTERVALS

        fun isValidWindowMinutes(minutes: Int): Boolean = minutes in 0 until MINUTES_IN_DAY

        /** `540` -> `"09:00"`; used by the Settings pickers and summaries. */
        fun formatMinutesOfDay(minutes: Int): String {
            val normalized = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY
            val hour = normalized / 60
            val minute = normalized % 60
            return "%02d:%02d".format(hour, minute)
        }
    }
}
