package com.namehamal.tracker.ui.settings

import android.Manifest
import android.app.TimePickerDialog
import android.text.format.DateFormat
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.settings.ReminderCycle
import com.namehamal.tracker.data.settings.ReminderSettings
import com.namehamal.tracker.notifications.ReminderPermission
import com.namehamal.tracker.ui.checkin.ReminderPermissionAffordance

/**
 * Reminder configuration: enabled toggle, cycle preset picker, daily active-window pickers, the
 * test-reminder control, and the notification permission affordance (contract `settings-ui.md`).
 */
@Composable
fun ReminderSettingsSection(
    state: ReminderUiState,
    onEnabledChange: (Boolean) -> Unit,
    onCycleSelected: (ReminderCycle) -> Unit,
    onWindowStartChange: (Int) -> Unit,
    onWindowEndChange: (Int) -> Unit,
    onSendTest: () -> Unit,
    onPermissionResult: () -> Unit = {},
) {
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { onPermissionResult() }
    val settings = state.settings

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Reminders", style = MaterialTheme.typography.titleLarge)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Reminder notifications")
            Switch(
                checked = settings.enabled,
                onCheckedChange = onEnabledChange,
                modifier = Modifier.testTag("reminders-enabled"),
            )
        }
        Text(
            "Reminders repeat on the chosen cycle only inside your daily window, independent of any " +
                "tracking session.",
            style = MaterialTheme.typography.bodyMedium,
        )

        CyclePicker(selected = settings.cycle, onSelect = onCycleSelected)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WindowPicker(
                label = "Window start",
                minutesOfDay = settings.windowStartMinutes,
                tag = "reminder-window-start",
                onPick = onWindowStartChange,
                modifier = Modifier.weight(1f),
            )
            WindowPicker(
                label = "Window end",
                minutesOfDay = settings.windowEndMinutes,
                tag = "reminder-window-end",
                onPick = onWindowEndChange,
                modifier = Modifier.weight(1f),
            )
        }
        if (settings.hasEmptyWindow) {
            Text(
                "Start and end are the same, so no reminders will be delivered.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
            )
        }

        ReminderPermissionAffordance(
            permissionState = state.permissionState,
            onRequestPermission = {
                ReminderPermission.markRequested(context)
                permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            },
            onOpenSystemSettings = {
                context.startActivity(ReminderPermission.systemSettingsIntent(context))
            },
        )
        Button(
            onClick = onSendTest,
            modifier = Modifier.fillMaxWidth().testTag("reminder-test-button"),
        ) {
            Text("Send test reminder")
        }

        state.message?.let { message ->
            Text(
                message,
                color = if (state.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun CyclePicker(selected: ReminderCycle, onSelect: (ReminderCycle) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text("Reminder cycle")
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().testTag("reminder-cycle-picker"),
        ) {
            Text(selected.label)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            ReminderCycle.entries.forEach { cycle ->
                DropdownMenuItem(
                    text = { Text(cycle.label) },
                    onClick = {
                        onSelect(cycle)
                        expanded = false
                    },
                    modifier = Modifier.testTag("reminder-cycle-option-${cycle.minutes}"),
                )
            }
        }
    }
}

@Composable
private fun WindowPicker(
    label: String,
    minutesOfDay: Int,
    tag: String,
    onPick: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    OutlinedButton(
        onClick = {
            TimePickerDialog(
                context,
                { _, hourOfDay, minute -> onPick(hourOfDay * 60 + minute) },
                minutesOfDay / 60,
                minutesOfDay % 60,
                DateFormat.is24HourFormat(context),
            ).show()
        },
        modifier = modifier.testTag(tag),
    ) {
        Text("$label · ${ReminderSettings.formatMinutesOfDay(minutesOfDay)}")
    }
}
