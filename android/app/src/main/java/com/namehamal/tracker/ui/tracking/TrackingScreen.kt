package com.namehamal.tracker.ui.tracking

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.format.DateFormat
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.ui.sync.SyncSettingsViewModel
import com.namehamal.tracker.ui.sync.SyncUiState
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
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
            SavedActivityPicker(
                activities = state.activities,
                categories = state.categories,
                recentTitles = state.titleSuggestions,
                selectedActivityId = state.selectedActivityId,
                onSelectActivity = viewModel::selectActivity,
                onSelectRecentTitle = viewModel::selectRecentTitle,
            )
            OutlinedTextField(
                value = state.title,
                onValueChange = viewModel::editTitle,
                label = { Text("Activity title") },
                placeholder = { Text("Type a custom activity") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("activity-title"),
            )
            LocalDateTimePicker(
                label = "Start",
                value = state.startedAtLocal,
                onValueChange = viewModel::editStartedAt,
                dateTag = "start-date-picker",
                timeTag = "start-time-picker",
            )
            LocalDateTimePicker(
                label = "End",
                value = state.endedAtLocal,
                onValueChange = viewModel::editEndedAt,
                dateTag = "end-date-picker",
                timeTag = "end-time-picker",
            )
            CategoryPicker(
                categories = state.categories,
                selectedCategoryId = state.selectedCategoryId,
                onSelect = viewModel::selectCategory,
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
            if (state.events.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(
                            onClick = viewModel::selectAll,
                            enabled = state.selectedEntryIds.size < state.events.size,
                        ) {
                            Text("Select all")
                        }
                        TextButton(
                            onClick = viewModel::clearSelection,
                            enabled = state.selectedEntryIds.isNotEmpty(),
                        ) {
                            Text("Clear selection")
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(
                            onClick = viewModel::requestRemoveSelected,
                            enabled = state.selectedEntryIds.isNotEmpty(),
                        ) {
                            Text("Remove selected (${state.selectedEntryIds.size})")
                        }
                        TextButton(onClick = viewModel::requestClearAll) { Text("Clear all") }
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
                            isSelected = event.entryId in state.selectedEntryIds,
                            onToggleSelection = { viewModel.toggleSelection(event.entryId) },
                            onStartAgain = { viewModel.prepareRestart(event) },
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

    state.pendingBulkRemovalIds?.let { ids ->
        val runningCount = state.events.count { it.entryId in ids && it.endedAt == null }
        AlertDialog(
            onDismissRequest = viewModel::cancelRemoveSelected,
            title = { Text("Remove selected sessions?") },
            text = {
                Text(
                    "Remove ${ids.size} selected session(s) from this device only? " +
                        (if (runningCount > 0) "$runningCount running session(s) will stop and be removed. " else "") +
                        "Desktop copies, saved endpoint, and categories will remain.",
                )
            },
            confirmButton = { TextButton(onClick = viewModel::confirmRemoveSelected) { Text("Remove selected") } },
            dismissButton = { TextButton(onClick = viewModel::cancelRemoveSelected) { Text("Cancel") } },
        )
    }

    if (state.confirmClearAll) {
        val runningCount = state.events.count { it.endedAt == null }
        AlertDialog(
            onDismissRequest = viewModel::cancelClearAll,
            title = { Text("Clear all sessions?") },
            text = {
                Text(
                    "Remove all ${state.events.size} Android-local session(s), regardless of selection? " +
                        (if (runningCount > 0) "$runningCount running session(s) will stop and be removed. " else "") +
                        "Desktop copies, saved endpoint, and categories will remain.",
                )
            },
            confirmButton = { TextButton(onClick = viewModel::confirmClearAll) { Text("Clear all") } },
            dismissButton = { TextButton(onClick = viewModel::cancelClearAll) { Text("Cancel") } },
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
private fun SavedActivityPicker(
    activities: List<ActivitySnapshotEntity>,
    categories: List<CategorySnapshotEntity>,
    recentTitles: List<String>,
    selectedActivityId: String?,
    onSelectActivity: (String) -> Unit,
    onSelectRecentTitle: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedActivity = activities.firstOrNull { it.activityId == selectedActivityId }
    val customTitles = recentTitles.filterNot { title -> activities.any { it.title == title } }

    Column {
        Text("Saved activities and recent titles")
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().testTag("saved-activity-picker"),
        ) {
            Text(selectedActivity?.title ?: "Choose from list")
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            if (activities.isNotEmpty()) {
                Text(
                    "Desktop activities",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.labelMedium,
                )
                activities.forEach { activity ->
                    val categoryName = categories.firstOrNull { it.categoryId == activity.categoryId }?.name
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text(activity.title)
                                if (categoryName != null) {
                                    Text(categoryName, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        },
                        onClick = {
                            onSelectActivity(activity.activityId)
                            expanded = false
                        },
                        modifier = Modifier.testTag("saved-activity-option-${activity.activityId}"),
                    )
                }
            }
            if (customTitles.isNotEmpty()) {
                Text(
                    "Recent titles",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    style = MaterialTheme.typography.labelMedium,
                )
                customTitles.forEach { title ->
                    DropdownMenuItem(
                        text = { Text(title) },
                        onClick = {
                            onSelectRecentTitle(title)
                            expanded = false
                        },
                    )
                }
            }
            if (activities.isEmpty() && customTitles.isEmpty()) {
                DropdownMenuItem(
                    text = { Text("Sync to load desktop activities") },
                    onClick = { expanded = false },
                )
            }
        }
        if (activities.isEmpty()) {
            Text(
                "Type a custom title, or sync with desktop to load saved activities.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun CategoryPicker(
    categories: List<CategorySnapshotEntity>,
    selectedCategoryId: String?,
    onSelect: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = categories.firstOrNull { it.categoryId == selectedCategoryId }?.name
    Box(modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = { expanded = true },
            modifier = Modifier.fillMaxWidth().testTag("category-picker"),
        ) {
            Text(selectedName ?: "Choose category")
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.fillMaxWidth(),
        ) {
            categories.forEach { category ->
                DropdownMenuItem(
                    text = { Text(category.name) },
                    onClick = {
                        onSelect(category.categoryId)
                        expanded = false
                    },
                    modifier = Modifier.testTag("category-option-${category.categoryId}"),
                )
            }
        }
    }
    if (categories.isEmpty()) {
        Text("Sync with desktop to load available categories.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun LocalDateTimePicker(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    dateTag: String,
    timeTag: String,
) {
    val context = LocalContext.current
    val current = LocalDateTime.parse(value, LOCAL_DATE_TIME_FORMATTER)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(
            onClick = {
                DatePickerDialog(
                    context,
                    { _, year, month, dayOfMonth ->
                        onValueChange(
                            current.withYear(year)
                                .withMonth(month + 1)
                                .withDayOfMonth(dayOfMonth)
                                .format(LOCAL_DATE_TIME_FORMATTER),
                        )
                    },
                    current.year,
                    current.monthValue - 1,
                    current.dayOfMonth,
                ).show()
            },
            modifier = Modifier.weight(1f).testTag(dateTag),
        ) {
            Text("$label date · ${current.format(DATE_LABEL_FORMATTER)}")
        }
        OutlinedButton(
            onClick = {
                TimePickerDialog(
                    context,
                    { _, hourOfDay, minute ->
                        onValueChange(
                            current.withHour(hourOfDay)
                                .withMinute(minute)
                                .format(LOCAL_DATE_TIME_FORMATTER),
                        )
                    },
                    current.hour,
                    current.minute,
                    DateFormat.is24HourFormat(context),
                ).show()
            },
            modifier = Modifier.weight(1f).testTag(timeTag),
        ) {
            Text("$label time · ${current.format(TIME_LABEL_FORMATTER)}")
        }
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
    isSelected: Boolean,
    onToggleSelection: () -> Unit,
    onStartAgain: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = isSelected,
                    onCheckedChange = { onToggleSelection() },
                    modifier = Modifier.testTag("session-selection-${event.entryId}"),
                )
                Text(event.title, style = MaterialTheme.typography.titleMedium)
            }
            val end = event.endedAt?.let(::formatEventTime) ?: "Running · ${elapsedText(event.startedAt, nowMillis)}"
            Text("${formatEventTime(event.startedAt)} – $end")
            Text(if (event.syncedAt == null) "Pending upload" else "Synced", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = onStartAgain,
                    modifier = Modifier.testTag("start-again-${event.entryId}"),
                ) {
                    Text("Start again")
                }
                TextButton(onClick = onRemove) { Text("Remove") }
            }
        }
    }
}

private fun formatEventTime(epochMillis: Long): String =
    Instant.ofEpochMilli(epochMillis)
        .atZone(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("MMM d, yyyy HH:mm"))

private val LOCAL_DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm")
private val DATE_LABEL_FORMATTER = DateTimeFormatter.ofPattern("MMM d, yyyy")
private val TIME_LABEL_FORMATTER = DateTimeFormatter.ofPattern("HH:mm")

private fun elapsedText(startedAt: Long, nowMillis: Long): String {
    val seconds = Duration.ofMillis((nowMillis - startedAt).coerceAtLeast(0)).seconds
    val hours = seconds / 3_600
    val minutes = (seconds % 3_600) / 60
    return if (hours > 0) "${hours}h ${minutes}m elapsed" else "${minutes}m elapsed"
}
