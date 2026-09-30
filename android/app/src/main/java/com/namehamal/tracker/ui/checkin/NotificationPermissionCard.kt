package com.namehamal.tracker.ui.checkin

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.notifications.ReminderPermission
import com.namehamal.tracker.notifications.ReminderPermissionState

/**
 * The reminder section's notification-permission affordance (FR-014): shows the three-way state,
 * requests `POST_NOTIFICATIONS` in-app when requestable, and deep-links to the app's system
 * notification settings when blocked.
 */
@Composable
fun ReminderPermissionAffordance(
    permissionState: ReminderPermissionState,
    onRequestPermission: () -> Unit,
    onOpenSystemSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.testTag("reminder-permission"),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        when (permissionState) {
            ReminderPermissionState.GRANTED -> Text(
                "Notifications are allowed.",
                style = MaterialTheme.typography.bodyMedium,
            )
            ReminderPermissionState.REQUESTABLE -> {
                Text(
                    "Allow notifications to receive reminders.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Button(
                    onClick = onRequestPermission,
                    modifier = Modifier.testTag("reminder-allow-notifications"),
                ) {
                    Text("Allow notifications")
                }
            }
            ReminderPermissionState.BLOCKED -> {
                Text(
                    "Notifications are turned off for this app. Open system settings to allow them.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Button(
                    onClick = onOpenSystemSettings,
                    modifier = Modifier.testTag("reminder-open-system-settings"),
                ) {
                    Text("Open notification settings")
                }
            }
        }
    }
}

/**
 * Legacy check-in permission card retained for the retired workday screen. It now delegates to the
 * shared reminder permission affordance so permission behavior stays in one place.
 */
@Composable
fun NotificationPermissionCard() {
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    Card(Modifier) {
        Column(Modifier) {
            Text("Check-in reminders")
            ReminderPermissionAffordance(
                permissionState = ReminderPermission.state(context),
                onRequestPermission = {
                    ReminderPermission.markRequested(context)
                    permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                },
                onOpenSystemSettings = {
                    context.startActivity(ReminderPermission.systemSettingsIntent(context))
                },
            )
        }
    }
}
