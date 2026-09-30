package com.namehamal.tracker.ui.settings

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.namehamal.tracker.TrackerApplication
import com.namehamal.tracker.data.settings.ReminderSettings
import com.namehamal.tracker.notifications.ReminderPermissionState
import com.namehamal.tracker.ui.tracking.TrackingScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun settingsHostsReminderAndSyncSectionsAndBackReturnsToTracking() {
        val tracker = composeRule.activity.application as TrackerApplication
        val reminderViewModel = tracker.reminderSettingsViewModel()
        val syncViewModel = tracker.syncSettingsViewModel()
        val trackingViewModel = tracker.trackingViewModel()
        val viewportSize = mutableStateOf(DpSize(360.dp, 800.dp))
        val showingSettings = mutableStateOf(false)
        composeRule.setContent {
            MaterialTheme {
                Box(
                    modifier = Modifier
                        .requiredSize(viewportSize.value)
                        .testTag("settings-viewport"),
                ) {
                    if (showingSettings.value) {
                        SettingsScreen(reminderViewModel, syncViewModel) { showingSettings.value = false }
                    } else {
                        TrackingScreen(viewModel = trackingViewModel, onOpenSettings = { showingSettings.value = true })
                    }
                }
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithTag("settings-entry").performClick()
        composeRule.waitForIdle()

        // Reminder section (US1 contract tags).
        composeRule.onNodeWithTag("settings-content").assertExists()
        composeRule.onNodeWithTag("settings-back").assertExists()
        composeRule.onNodeWithTag("reminders-enabled").assertExists()
        composeRule.onNodeWithTag("reminder-cycle-picker").assertExists()
        composeRule.onNodeWithTag("reminder-window-start").assertExists()
        composeRule.onNodeWithTag("reminder-window-end").assertExists()
        composeRule.onNodeWithTag("reminder-test-button").assertExists()
        composeRule.onNodeWithTag("reminder-permission").assertExists()

        // Desktop connection / sync section (FR-015).
        composeRule.onNodeWithTag("sync-host").assertExists()
        composeRule.onNodeWithTag("sync-port").assertExists()
        composeRule.onNodeWithTag("sync-save").assertExists()
        composeRule.onNodeWithTag("sync-forget").assertExists()
        composeRule.onNodeWithTag("sync-now").assertExists()

        val viewportBottom = composeRule.onNodeWithTag("settings-viewport")
            .fetchSemanticsNode().boundsInRoot.bottom
        val contentBounds = composeRule.onNodeWithTag("settings-content")
            .fetchSemanticsNode().boundsInRoot
        val backBounds = composeRule.onNodeWithTag("settings-back")
            .fetchSemanticsNode().boundsInRoot
        assertTrue("Settings content must start below the top system inset", contentBounds.top > 0f)
        assertTrue("Back control must be inside Scaffold content", backBounds.top >= contentBounds.top)
        assertTrue("Back control must fit in the supported viewport", backBounds.bottom <= viewportBottom)

        composeRule.onNodeWithTag("settings-back").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("NamehAmal tracking").assertExists()
    }

    @Test
    fun testReminderButtonAndPermissionAffordanceFollowPermissionState() {
        val permissionState = mutableStateOf(ReminderPermissionState.GRANTED)
        var testClicks = 0
        composeRule.setContent {
            MaterialTheme {
                ReminderSettingsSection(
                    state = ReminderUiState(
                        settings = ReminderSettings(enabled = true),
                        permissionState = permissionState.value,
                    ),
                    onEnabledChange = {},
                    onCycleSelected = {},
                    onWindowStartChange = {},
                    onWindowEndChange = {},
                    onSendTest = { testClicks += 1 },
                )
            }
        }
        composeRule.waitForIdle()

        // Granted: the test button posts, and no permission request/deep-link is offered.
        composeRule.onNodeWithTag("reminder-test-button").performClick()
        composeRule.runOnIdle { assertEquals(1, testClicks) }
        composeRule.onNodeWithTag("reminder-allow-notifications").assertDoesNotExist()
        composeRule.onNodeWithTag("reminder-open-system-settings").assertDoesNotExist()

        // Requestable: in-app runtime permission request.
        composeRule.runOnIdle { permissionState.value = ReminderPermissionState.REQUESTABLE }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("reminder-allow-notifications").assertExists()
        composeRule.onNodeWithTag("reminder-open-system-settings").assertDoesNotExist()

        // Blocked: deep link to system notification settings.
        composeRule.runOnIdle { permissionState.value = ReminderPermissionState.BLOCKED }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("reminder-open-system-settings").assertExists()
        composeRule.onNodeWithTag("reminder-allow-notifications").assertDoesNotExist()
    }

    @Test
    fun cyclePickerOffersExactlyTheFivePresets() {
        composeRule.setContent {
            MaterialTheme {
                ReminderSettingsSection(
                    state = ReminderUiState(settings = ReminderSettings()),
                    onEnabledChange = {},
                    onCycleSelected = {},
                    onWindowStartChange = {},
                    onWindowEndChange = {},
                    onSendTest = {},
                )
            }
        }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("reminder-cycle-picker").performClick()
        composeRule.waitForIdle()
        for (minutes in listOf(15, 30, 60, 120, 180)) {
            composeRule.onNodeWithTag("reminder-cycle-option-$minutes").assertExists()
        }
        composeRule.onNodeWithTag("reminder-cycle-option-45").assertDoesNotExist()
    }
}
