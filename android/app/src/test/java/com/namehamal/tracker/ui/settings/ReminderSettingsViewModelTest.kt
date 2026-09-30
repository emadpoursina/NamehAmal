package com.namehamal.tracker.ui.settings

import com.namehamal.tracker.data.settings.ReminderCycle
import com.namehamal.tracker.data.settings.ReminderSettings
import com.namehamal.tracker.data.settings.ReminderSettingsSource
import com.namehamal.tracker.notifications.ReminderPermissionState
import com.namehamal.tracker.notifications.ReminderScheduling
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReminderSettingsViewModelTest {

    @Test fun enablingPersistsAndReschedules() = runTest {
        val store = FakeSettingsSource()
        val scheduler = FakeScheduler()
        val viewModel = viewModel(store, scheduler)

        viewModel.setEnabled(true)
        runCurrent()

        assertTrue(store.current.enabled)
        assertEquals(1, scheduler.rescheduleCalls.size)
        assertEquals(0, scheduler.cancelCalls)
        assertTrue(viewModel.state.value.settings.enabled)
    }

    @Test fun selectingCyclePersistsAndReschedulesWithoutRestart() = runTest {
        val store = FakeSettingsSource(ReminderSettings(enabled = true))
        val scheduler = FakeScheduler()
        val viewModel = viewModel(store, scheduler)

        viewModel.selectCycle(ReminderCycle.HOURS_2)
        runCurrent()

        assertEquals(120, store.current.intervalMinutes)
        assertEquals(120, viewModel.state.value.settings.intervalMinutes)
        assertEquals(1, scheduler.rescheduleCalls.size)
        assertEquals(120, scheduler.rescheduleCalls.single().intervalMinutes)
    }

    @Test fun editingWindowPersistsAndReschedules() = runTest {
        val store = FakeSettingsSource(ReminderSettings(enabled = true))
        val scheduler = FakeScheduler()
        val viewModel = viewModel(store, scheduler)

        viewModel.setWindowStart(600)
        runCurrent()
        viewModel.setWindowEnd(1320)
        runCurrent()

        assertEquals(600, store.current.windowStartMinutes)
        assertEquals(1320, store.current.windowEndMinutes)
        assertEquals(2, scheduler.rescheduleCalls.size)
    }

    @Test fun disablingCancelsScheduledWorkAndRetainsCycleAndWindow() = runTest {
        val store = FakeSettingsSource(
            ReminderSettings(enabled = true, intervalMinutes = 180, windowStartMinutes = 600, windowEndMinutes = 1320),
        )
        val scheduler = FakeScheduler()
        val viewModel = viewModel(store, scheduler)

        viewModel.setEnabled(false)
        runCurrent()

        assertFalse(store.current.enabled)
        assertEquals(180, store.current.intervalMinutes)
        assertEquals(600, store.current.windowStartMinutes)
        assertEquals(1320, store.current.windowEndMinutes)
        assertEquals(1, scheduler.cancelCalls)
        assertEquals(0, scheduler.rescheduleCalls.size)
    }

    @Test fun testReminderPostsWhenPermittedAndChangesNothing() = runTest {
        val store = FakeSettingsSource(ReminderSettings(enabled = false, intervalMinutes = 120))
        val scheduler = FakeScheduler()
        var posted = 0
        val viewModel = viewModel(
            store,
            scheduler,
            permissionState = { ReminderPermissionState.GRANTED },
            postTest = { posted += 1; true },
        )

        viewModel.sendTestReminder()
        runCurrent()

        assertEquals(1, posted)
        assertEquals(0, scheduler.rescheduleCalls.size)
        assertEquals(0, scheduler.cancelCalls)
        assertEquals(ReminderSettings(enabled = false, intervalMinutes = 120), store.current)
        assertEquals("Test reminder sent.", viewModel.state.value.message)
    }

    @Test fun testReminderExplainsPermissionRequiredWhenNotPermitted() = runTest {
        val store = FakeSettingsSource()
        val scheduler = FakeScheduler()
        var posted = 0
        val viewModel = viewModel(
            store,
            scheduler,
            permissionState = { ReminderPermissionState.REQUESTABLE },
            postTest = { posted += 1; true },
        )

        viewModel.sendTestReminder()
        runCurrent()

        assertEquals(0, posted)
        assertEquals(0, scheduler.rescheduleCalls.size)
        assertEquals(0, scheduler.cancelCalls)
        assertTrue(viewModel.state.value.isError)
        assertTrue(viewModel.state.value.message!!.contains("permission", ignoreCase = true))
    }

    @Test fun permissionStateIsExposedAndRefreshable() = runTest {
        val store = FakeSettingsSource()
        var state = ReminderPermissionState.REQUESTABLE
        val viewModel = viewModel(store, FakeScheduler(), permissionState = { state })

        runCurrent()
        assertEquals(ReminderPermissionState.REQUESTABLE, viewModel.state.value.permissionState)

        state = ReminderPermissionState.BLOCKED
        viewModel.refreshPermissionState()
        runCurrent()
        assertEquals(ReminderPermissionState.BLOCKED, viewModel.state.value.permissionState)
    }

    private fun TestScope.viewModel(
        store: ReminderSettingsSource,
        scheduler: ReminderScheduling,
        permissionState: () -> ReminderPermissionState = { ReminderPermissionState.GRANTED },
        postTest: () -> Boolean = { false },
    ) = ReminderSettingsViewModel(
        store = store,
        scheduler = scheduler,
        permissionStateProvider = permissionState,
        postTestNotification = postTest,
        coroutineScope = backgroundScope,
    )

    private class FakeScheduler : ReminderScheduling {
        val rescheduleCalls = mutableListOf<ReminderSettings>()
        var cancelCalls = 0

        override fun scheduleNext(settings: ReminderSettings) = Unit

        override fun cancelAll() {
            cancelCalls += 1
        }

        override fun reschedule(settings: ReminderSettings) {
            rescheduleCalls += settings
        }
    }

    private class FakeSettingsSource(initial: ReminderSettings = ReminderSettings()) : ReminderSettingsSource {
        private val flow = MutableStateFlow(initial)
        val current: ReminderSettings get() = flow.value

        override val settings: Flow<ReminderSettings> = flow

        override suspend fun save(settings: ReminderSettings) {
            flow.value = settings
        }

        override suspend fun setEnabled(enabled: Boolean) {
            flow.value = flow.value.copy(enabled = enabled)
        }

        override suspend fun setIntervalMinutes(minutes: Int) {
            flow.value = flow.value.copy(intervalMinutes = minutes)
        }

        override suspend fun setWindow(startMinutes: Int, endMinutes: Int) {
            flow.value = flow.value.copy(windowStartMinutes = startMinutes, windowEndMinutes = endMinutes)
        }
    }
}
