package com.namehamal.tracker.ui.sync

import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.namehamal.tracker.TrackerApplication
import com.namehamal.tracker.ui.tracking.TrackingScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SyncSettingsScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun settingsBackControlStaysBelowScaffoldInsetsAtCompactAndExpandedSizes() {
        val tracker = composeRule.activity.application as TrackerApplication
        val settingsViewModel = tracker.syncSettingsViewModel()
        val trackingViewModel = tracker.trackingViewModel()
        val viewportSize = androidx.compose.runtime.mutableStateOf(DpSize(360.dp, 800.dp))
        val showingSettings = androidx.compose.runtime.mutableStateOf(false)
        composeRule.setContent {
            MaterialTheme {
                Box(
                    modifier = Modifier
                        .requiredSize(viewportSize.value)
                        .testTag("settings-viewport"),
                ) {
                    if (showingSettings.value) {
                        SyncSettingsScreen(settingsViewModel) { showingSettings.value = false }
                    } else {
                        TrackingScreen(
                            viewModel = trackingViewModel,
                            syncViewModel = settingsViewModel,
                            onOpenSettings = { showingSettings.value = true },
                        )
                    }
                }
            }
        }
        composeRule.waitForIdle()

        for (size in listOf(DpSize(360.dp, 800.dp), DpSize(600.dp, 960.dp))) {
            composeRule.runOnIdle { viewportSize.value = size }
            composeRule.waitForIdle()
            val trackingHeaderTop = composeRule.onNodeWithText("NamehAmal tracking")
                .fetchSemanticsNode().boundsInRoot.top

            composeRule.onNodeWithText("Connection settings").performClick()
            composeRule.waitForIdle()
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
            val returnedHeaderTop = composeRule.onNodeWithText("NamehAmal tracking")
                .fetchSemanticsNode().boundsInRoot.top
            assertEquals(trackingHeaderTop, returnedHeaderTop, 0.5f)
        }
    }
}
