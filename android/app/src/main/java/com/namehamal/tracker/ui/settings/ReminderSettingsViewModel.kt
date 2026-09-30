package com.namehamal.tracker.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.namehamal.tracker.data.settings.ReminderCycle
import com.namehamal.tracker.data.settings.ReminderSettings
import com.namehamal.tracker.data.settings.ReminderSettingsSource
import com.namehamal.tracker.notifications.ReminderPermissionState
import com.namehamal.tracker.notifications.ReminderScheduling
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** UI state for the reminder configuration section of the Settings screen. */
data class ReminderUiState(
    val settings: ReminderSettings = ReminderSettings(),
    val permissionState: ReminderPermissionState = ReminderPermissionState.GRANTED,
    val message: String? = null,
    val isError: Boolean = false,
)

/**
 * Reminder configuration state: persists enabled state, cycle preset, and the daily window, and
 * reschedules on every change so edits take effect without an app restart (FR-009).
 */
class ReminderSettingsViewModel(
    private val store: ReminderSettingsSource,
    private val scheduler: ReminderScheduling,
    private val permissionStateProvider: () -> ReminderPermissionState = { ReminderPermissionState.GRANTED },
    private val postTestNotification: () -> Boolean = { false },
    coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val scope = coroutineScope ?: viewModelScope
    private val mutable = MutableStateFlow(ReminderUiState(permissionState = permissionStateProvider()))
    val state: StateFlow<ReminderUiState> = mutable.asStateFlow()

    init {
        scope.launch {
            store.settings.collect { settings ->
                mutable.value = mutable.value.copy(settings = settings)
            }
        }
    }

    fun setEnabled(enabled: Boolean) = updateSettings { it.copy(enabled = enabled) }

    fun selectCycle(cycle: ReminderCycle) = updateSettings { it.copy(intervalMinutes = cycle.minutes) }

    fun setWindowStart(minutes: Int) = updateSettings { it.copy(windowStartMinutes = minutes) }

    fun setWindowEnd(minutes: Int) = updateSettings { it.copy(windowEndMinutes = minutes) }

    /**
     * Posts the sample reminder immediately when notifications are permitted, without touching
     * settings or scheduled work (FR-012, FR-013). When not permitted it explains that permission is
     * required instead of failing silently (FR-014).
     */
    fun sendTestReminder() {
        if (mutable.value.permissionState != ReminderPermissionState.GRANTED) {
            mutable.value = mutable.value.copy(
                message = "Notification permission is required to send a test reminder.",
                isError = true,
            )
            return
        }
        val posted = postTestNotification()
        mutable.value = mutable.value.copy(
            message = if (posted) "Test reminder sent." else "Notifications are not permitted.",
            isError = !posted,
        )
    }

    fun refreshPermissionState() {
        mutable.value = mutable.value.copy(permissionState = permissionStateProvider())
    }

    fun dismissMessage() {
        mutable.value = mutable.value.copy(message = null, isError = false)
    }

    private fun updateSettings(transform: (ReminderSettings) -> ReminderSettings) {
        scope.launch {
            val updated = transform(mutable.value.settings)
            store.save(updated)
            if (updated.enabled) scheduler.reschedule(updated) else scheduler.cancelAll()
            mutable.value = mutable.value.copy(settings = updated, message = null, isError = false)
        }
    }
}
