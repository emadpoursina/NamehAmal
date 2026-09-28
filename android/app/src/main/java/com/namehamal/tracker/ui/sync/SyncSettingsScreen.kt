package com.namehamal.tracker.ui.sync

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

/**
 * Saved-endpoint settings and the explicit Sync action (T033).
 * No QR pairing or security setup: the user saves the Mac IP/port once.
 */
@Composable
fun SyncSettingsScreen(viewModel: SyncSettingsViewModel, onBack: (() -> Unit)? = null) {
    val state by viewModel.state.collectAsState()
    Scaffold { contentPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .testTag("settings-content")
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Desktop sync", style = MaterialTheme.typography.titleLarge)
                onBack?.let {
                    TextButton(onClick = it, modifier = Modifier.testTag("settings-back")) { Text("Back") }
                }
            }
            Text(
                "Enter the server address and port shown in desktop Settings. Saving works offline. " +
                    "Sync uploads completed sessions only when you tap Sync, on a trusted private network.",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = state.host,
                onValueChange = viewModel::editHost,
                label = { Text("Server address") },
                placeholder = { Text("192.168.1.20 or macbook.local") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.port,
                onValueChange = viewModel::editPort,
                label = { Text("Sync port") },
                placeholder = { Text("3061") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::save) { Text("Save") }
                OutlinedButton(onClick = viewModel::forget) { Text("Forget endpoint") }
            }
            state.savedEndpoint?.let { saved ->
                Text("Saved: ${saved.host}:${saved.port}", style = MaterialTheme.typography.bodyMedium)
            }
            Text(
                "Pending uploads: ${state.pendingCount}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Button(
                onClick = viewModel::syncNow,
                enabled = !state.isSyncing && state.savedEndpoint != null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.isSyncing) "Syncing…" else "Sync now")
            }
            state.message?.let { message ->
                Text(
                    message,
                    color = if (state.isError) MaterialTheme.colorScheme.error
                    else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Plain HTTP on trusted private networks only. The host must support titled upload-only sync. " +
                    "Forgetting the endpoint clears this app; it does not revoke host access.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
