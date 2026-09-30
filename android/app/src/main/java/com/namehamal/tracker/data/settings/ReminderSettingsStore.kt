package com.namehamal.tracker.data.settings

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.reminderSettingsDataStore by preferencesDataStore("reminder_settings")

/** Read/persist contract for reminder configuration, so the ViewModel is testable without DataStore. */
interface ReminderSettingsSource {
    val settings: Flow<ReminderSettings>
    suspend fun save(settings: ReminderSettings)
    suspend fun setEnabled(enabled: Boolean)
    suspend fun setIntervalMinutes(minutes: Int)
    suspend fun setWindow(startMinutes: Int, endMinutes: Int)
}

/**
 * DataStore-backed reminder configuration (FR-010).
 *
 * Absent keys read as the documented defaults, so an existing installation starts with reminders
 * disabled and the 09:00-23:00 / 1-hour defaults. Stored values that fall outside the allowed
 * presets/ranges fall back to defaults instead of propagating an invalid schedule.
 */
class ReminderSettingsStore(
    private val store: DataStore<Preferences>,
) : ReminderSettingsSource {
    constructor(context: Context) : this(context.reminderSettingsDataStore)

    private val enabledKey = booleanPreferencesKey("enabled")
    private val intervalKey = intPreferencesKey("interval_minutes")
    private val windowStartKey = intPreferencesKey("window_start_minutes")
    private val windowEndKey = intPreferencesKey("window_end_minutes")

    override val settings: Flow<ReminderSettings> = store.data.map(::read)

    /** Persist the full configuration after validating every field. */
    override suspend fun save(settings: ReminderSettings) {
        store.edit { prefs ->
            prefs[enabledKey] = settings.enabled
            prefs[intervalKey] = sanitizeInterval(settings.intervalMinutes)
            prefs[windowStartKey] = sanitizeWindowMinutes(settings.windowStartMinutes, ReminderSettings.DEFAULT_WINDOW_START_MINUTES)
            prefs[windowEndKey] = sanitizeWindowMinutes(settings.windowEndMinutes, ReminderSettings.DEFAULT_WINDOW_END_MINUTES)
        }
    }

    override suspend fun setEnabled(enabled: Boolean) {
        store.edit { prefs -> prefs[enabledKey] = enabled }
    }

    override suspend fun setIntervalMinutes(minutes: Int) {
        store.edit { prefs -> prefs[intervalKey] = sanitizeInterval(minutes) }
    }

    override suspend fun setWindow(startMinutes: Int, endMinutes: Int) {
        store.edit { prefs ->
            prefs[windowStartKey] = sanitizeWindowMinutes(startMinutes, ReminderSettings.DEFAULT_WINDOW_START_MINUTES)
            prefs[windowEndKey] = sanitizeWindowMinutes(endMinutes, ReminderSettings.DEFAULT_WINDOW_END_MINUTES)
        }
    }

    companion object {
        fun read(prefs: Preferences): ReminderSettings = ReminderSettings(
            enabled = prefs[booleanPreferencesKey("enabled")] ?: false,
            intervalMinutes = sanitizeInterval(
                prefs[intPreferencesKey("interval_minutes")] ?: ReminderCycle.DEFAULT.minutes,
            ),
            windowStartMinutes = sanitizeWindowMinutes(
                prefs[intPreferencesKey("window_start_minutes")] ?: ReminderSettings.DEFAULT_WINDOW_START_MINUTES,
                ReminderSettings.DEFAULT_WINDOW_START_MINUTES,
            ),
            windowEndMinutes = sanitizeWindowMinutes(
                prefs[intPreferencesKey("window_end_minutes")] ?: ReminderSettings.DEFAULT_WINDOW_END_MINUTES,
                ReminderSettings.DEFAULT_WINDOW_END_MINUTES,
            ),
        )

        fun sanitizeInterval(minutes: Int): Int =
            if (ReminderSettings.isValidInterval(minutes)) minutes else ReminderCycle.DEFAULT.minutes

        fun sanitizeWindowMinutes(minutes: Int, fallback: Int): Int =
            if (ReminderSettings.isValidWindowMinutes(minutes)) minutes else fallback
    }
}
