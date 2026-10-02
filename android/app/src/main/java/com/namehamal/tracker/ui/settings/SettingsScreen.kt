package com.namehamal.tracker.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.namehamal.tracker.ui.sync.SyncSettingsSection
import com.namehamal.tracker.ui.sync.SyncSettingsViewModel

/**
 * The single Settings page: all user-configurable options live here (FR-001). It hosts the reminder
 * configuration and the relocated desktop connection/sync section, with a Back control returning to
 * the main tracking screen (contract `settings-ui.md`).
 */
@Composable
fun SettingsScreen(
    reminderViewModel: ReminderSettingsViewModel,
    syncViewModel: SyncSettingsViewModel,
    onBack: () -> Unit,
) {
    val reminderState by reminderViewModel.state.collectAsState()
    // Returning from the system notification settings does not trigger the in-app permission
    // launcher, so refresh on every resume; otherwise the test button keeps reporting "permission
    // required" after the user just granted it.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) reminderViewModel.refreshPermissionState()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Scaffold { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .testTag("settings-content")
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Settings", style = MaterialTheme.typography.titleLarge)
                TextButton(onClick = onBack, modifier = Modifier.testTag("settings-back")) { Text("Back") }
            }

            ReminderSettingsSection(
                state = reminderState,
                onEnabledChange = reminderViewModel::setEnabled,
                onCycleSelected = reminderViewModel::selectCycle,
                onWindowStartChange = reminderViewModel::setWindowStart,
                onWindowEndChange = reminderViewModel::setWindowEnd,
                onSendTest = reminderViewModel::sendTestReminder,
                onPermissionResult = reminderViewModel::refreshPermissionState,
            )

            HorizontalDivider()

            SyncSettingsSection(syncViewModel)
        }
    }
}
