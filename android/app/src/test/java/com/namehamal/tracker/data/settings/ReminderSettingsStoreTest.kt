package com.namehamal.tracker.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ReminderSettingsStoreTest {
    private lateinit var file: File
    private lateinit var dataStore: DataStore<Preferences>
    private lateinit var store: ReminderSettingsStore

    @Before fun setUp() {
        file = File.createTempFile("reminder-settings-test", ".preferences_pb").also { it.delete() }
        dataStore = PreferenceDataStoreFactory.create(produceFile = { file })
        store = ReminderSettingsStore(dataStore)
    }

    @After fun tearDown() {
        file.delete()
    }

    @Test fun absentKeysReadDocumentedDefaults() = runBlocking {
        assertEquals(ReminderSettings(), store.settings.first())
        assertEquals(false, store.settings.first().enabled)
        assertEquals(60, store.settings.first().intervalMinutes)
        assertEquals(540, store.settings.first().windowStartMinutes)
        assertEquals(1380, store.settings.first().windowEndMinutes)
    }

    @Test fun saveThenReadRoundTripsAllFields() = runBlocking {
        val saved = ReminderSettings(
            enabled = true,
            intervalMinutes = 120,
            windowStartMinutes = 600,
            windowEndMinutes = 1320,
        )
        store.save(saved)
        assertEquals(saved, store.settings.first())
    }

    @Test fun individualSettersPersistEachField() = runBlocking {
        store.setEnabled(true)
        store.setIntervalMinutes(15)
        store.setWindow(0, 1439)
        val settings = store.settings.first()
        assertTrue(settings.enabled)
        assertEquals(15, settings.intervalMinutes)
        assertEquals(0, settings.windowStartMinutes)
        assertEquals(1439, settings.windowEndMinutes)
    }

    @Test fun nonPresetIntervalFallsBackToDefaultOnSave() = runBlocking {
        store.save(ReminderSettings(intervalMinutes = 45))
        assertEquals(60, store.settings.first().intervalMinutes)
    }

    @Test fun outOfRangeWindowMinutesFallBackToDefaultOnSave() = runBlocking {
        store.save(ReminderSettings(windowStartMinutes = 1440, windowEndMinutes = -1))
        val settings = store.settings.first()
        assertEquals(540, settings.windowStartMinutes)
        assertEquals(1380, settings.windowEndMinutes)
    }

    @Test fun invalidStoredValuesReadBackAsDefaults() = runBlocking {
        dataStore.edit { prefs ->
            prefs[booleanPreferencesKey("enabled")] = true
            prefs[intPreferencesKey("interval_minutes")] = 45
            prefs[intPreferencesKey("window_start_minutes")] = 5000
            prefs[intPreferencesKey("window_end_minutes")] = 5001
        }
        val settings = store.settings.first()
        assertTrue(settings.enabled)
        assertEquals(60, settings.intervalMinutes)
        assertEquals(540, settings.windowStartMinutes)
        assertEquals(1380, settings.windowEndMinutes)
    }

    @Test fun validStoredValuesAreKept() = runBlocking {
        dataStore.edit { prefs ->
            prefs[booleanPreferencesKey("enabled")] = true
            prefs[intPreferencesKey("interval_minutes")] = 180
            prefs[intPreferencesKey("window_start_minutes")] = 1320
            prefs[intPreferencesKey("window_end_minutes")] = 360
        }
        val settings = store.settings.first()
        assertTrue(settings.enabled)
        assertFalse(settings.hasEmptyWindow)
        assertEquals(180, settings.intervalMinutes)
        assertEquals(1320, settings.windowStartMinutes)
        assertEquals(360, settings.windowEndMinutes)
    }
}
