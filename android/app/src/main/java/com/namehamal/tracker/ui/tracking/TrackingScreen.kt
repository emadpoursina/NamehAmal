package com.namehamal.tracker.ui.tracking

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.ui.sync.SyncSettingsViewModel
import com.namehamal.tracker.ui.sync.SyncUiState
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TrackingScreen(
    viewModel: TrackingViewModel,
    syncViewModel: SyncSettingsViewModel,
    onOpenSettings: () -> Unit,
) {
    val state by viewModel.state.collectAsState()
    val syncState by syncViewModel.state.collectAsState(initial = SyncUiState())

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("NamehAmal tracking", style = MaterialTheme.typography.headlineMedium)
            Text("Track directly. Times use your device's local timezone.", style = MaterialTheme.typography.bodyMedium)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        if (syncState.savedEndpoint == null) onOpenSettings() else syncViewModel.syncNow()
                    },
                    enabled = !syncState.isSyncing,
                ) {
                    Text(
                        when {
                            syncState.isSyncing -> "Syncing…"
                            syncState.savedEndpoint == null -> "Set up sync"
                            else -> "Sync"
                        },
                    )
                }
                OutlinedButton(onClick = onOpenSettings) { Text("Connection settings") }
            }
            syncState.savedEndpoint?.let {
                Text("Desktop: ${it.host}:${it.port}", style = MaterialTheme.typography.bodySmall)
            }
            syncState.message?.let {
                Text(
                    it,
                    color = if (syncState.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            state.runningSession?.let { event ->
                RunningSessionCard(
                    event = event,
                    nowMillis = state.nowMillis,
                    onStop = { viewModel.stop(event.entryId) },
                )
            }

            Text("Add a session", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(
                value = state.title,
                onValueChange = viewModel::editTitle,
                label = { Text("Activity title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.startedAtLocal,
                onValueChange = viewModel::editStartedAt,
                label = { Text("Start (YYYY-MM-DD HH:MM, local time)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.endedAtLocal,
                onValueChange = viewModel::editEndedAt,
                label = { Text("End (YYYY-MM-DD HH:MM, local time)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::saveCompleted) { Text("Save completed") }
                OutlinedButton(onClick = viewModel::start) { Text("Start") }
            }
            state.message?.let { message ->
                Text(
                    message,
                    color = if (state.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            if (state.titleSuggestions.isNotEmpty()) {
                Text("Start again", style = MaterialTheme.typography.titleMedium)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    state.titleSuggestions.forEach { title ->
                        OutlinedButton(
                            onClick = { viewModel.startAgain(title) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(title)
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("All sessions (${state.events.size})", style = MaterialTheme.typography.titleLarge)
                if (state.syncedEventCount > 0) {
                    TextButton(onClick = viewModel::requestClearSynced) {
                        Text("Clear synced (${state.syncedEventCount})")
                    }
                }
            }
            if (state.events.isEmpty()) {
                Text("No sessions yet. Add a completed session or start recording.")
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    state.events.forEach { event ->
                        SessionCard(
                            event = event,
                            nowMillis = state.nowMillis,
                            onStartAgain = { viewModel.startAgain(event.title) },
                            onRemove = { viewModel.requestRemove(event) },
                        )
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }

    state.pendingRemoval?.let { event ->
        AlertDialog(
            onDismissRequest = viewModel::cancelRemove,
            title = { Text("Remove session?") },
            text = {
                Text(
                    "${event.title} will be removed from this device only. " +
                        if (event.endedAt == null) "The running session will stop and be removed." else "The desktop copy, if any, will not be deleted.",
                )
            },
            confirmButton = { TextButton(onClick = viewModel::confirmRemove) { Text("Remove") } },
            dismissButton = { TextButton(onClick = viewModel::cancelRemove) { Text("Cancel") } },
        )
    }

    if (state.confirmClearSynced) {
        AlertDialog(
            onDismissRequest = viewModel::cancelClearSynced,
            title = { Text("Clear synced sessions?") },
            text = {
                Text("Remove ${state.syncedEventCount} acknowledged session(s) from this device? Desktop records will remain; pending uploads will be kept.")
            },
            confirmButton = { TextButton(onClick = viewModel::confirmClearSynced) { Text("Clear synced") } },
            dismissButton = { TextButton(onClick = viewModel::cancelClearSynced) { Text("Cancel") } },
        )
    }
}

@Composable
private fun RunningSessionCard(event: TimeIntervalEntity, nowMillis: Long, onStop: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("Running: ${event.title}", style = MaterialTheme.typography.titleMedium)
            Text("Started ${formatEventTime(event.startedAt)} · ${elapsedText(event.startedAt, nowMillis)}")
            Button(onClick = onStop) { Text("Stop") }
        }
    }
}

@Composable
private fun SessionCard(
    event: TimeIntervalEntity,
    nowMillis: Long,
    onStartAgain: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(event.title, style = MaterialTheme.typography.titleMedium)
            val end = event.endedAt?.let(::formatEventTime) ?: "Running · ${elapsedText(event.startedAt, nowMillis)}"
            Text("${formatEventTime(event.startedAt)} – $end")
            Text(if (event.syncedAt == null) "Pending upload" else "Synced", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onStartAgain) { Text("Start again") }
                TextButton(onClick = onRemove) { Text("Remove") }
            }
        }
    }
}

private fun formatEventTime(epochMillis: Long): String =
    Instant.ofEpochMilli(epochMillis)
        .atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm"))

private fun elapsedText(startedAt: Long, nowMillis: Long): String {
    val seconds = Duration.ofMillis((nowMillis - startedAt).coerceAtLeast(0)).seconds
    val hours = seconds / 3_600
    val minutes = (seconds % 3_600) / 60
    return if (hours > 0) "${hours}h ${minutes}m elapsed" else "${minutes}m elapsed"
}
