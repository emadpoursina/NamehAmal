package com.namehamal.tracker.ui.today

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
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.domain.WorkdayController
import com.namehamal.tracker.ui.checkin.CheckInReviewScreen
import com.namehamal.tracker.ui.checkin.NotificationPermissionCard
import com.namehamal.tracker.ui.timeline.IntervalEditViewModel
import com.namehamal.tracker.ui.timeline.TimelineScreen
import java.time.Instant
import kotlinx.coroutines.launch

@Composable
fun TrackerHome(controller: WorkdayController, repository: TimelineRepository) {
    val activeWorkday by repository.observeActiveWorkday().collectAsState(initial = null)
    val intervals by repository.observeTimeline().collectAsState(initial = emptyList())
    val activities by repository.observeActivities().collectAsState(initial = emptyList())
    var selectedActivityId by rememberSaveable { mutableStateOf<String?>(null) }
    var page by rememberSaveable { mutableStateOf("today") }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val editor = remember(repository) { IntervalEditViewModel(repository) }

    fun run(action: suspend () -> Unit) {
        scope.launch {
            runCatching { action() }.onFailure { snackbar.showSnackbar(it.message ?: "Could not save the timeline.") }
        }
    }

    val onEdit: (TimeIntervalEntity, Long, Long, String?) -> Unit = { entry, start, end, activity ->
        run { editor.save(entry.entryId, start, end, activity) }
    }
    val onSplit: (TimeIntervalEntity, Instant) -> Unit = { entry, boundary -> run { editor.split(entry.entryId, boundary) } }
    val onConfirm: (TimeIntervalEntity) -> Unit = { entry -> run { repository.confirmInterval(entry.entryId) } }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("NamehAmal Tracker", style = MaterialTheme.typography.headlineMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { page = "today" }) { Text("Today") }
                OutlinedButton(onClick = { page = "timeline" }) { Text("Timeline") }
                OutlinedButton(onClick = { page = "review" }) { Text("Check-in review") }
            }
            ActivityPicker(activities, selectedActivityId) { selectedActivityId = it }
            NotificationPermissionCard()
            if (page == "today") {
                TodayScreen(
                    active = activeWorkday != null,
                    currentInterval = intervals.firstOrNull { it.endedAt == null },
                    activities = activities,
                    selectedActivityId = selectedActivityId,
                    onStart = { run { controller.startWorkday(selectedActivityId) } },
                    onChange = { run { controller.changeActivity(selectedActivityId) } },
                    onBreak = { run { controller.startBreak() } },
                    onResume = { run { controller.resumeActivity(selectedActivityId) } },
                    onEnd = { run { controller.endWorkday() } },
                )
                Text("Today's timeline", style = MaterialTheme.typography.titleMedium)
                TimelineScreen(intervals, activities, onEdit, onSplit, onConfirm)
            } else if (page == "review") {
                CheckInReviewScreen(intervals, activities, onEdit, onSplit, onConfirm)
            } else {
                TimelineScreen(intervals, activities, onEdit, onSplit, onConfirm)
            }
        }
    }
}

@Composable
fun TodayScreen(
    active: Boolean,
    currentInterval: TimeIntervalEntity?,
    activities: List<ActivitySnapshotEntity>,
    selectedActivityId: String?,
    onStart: () -> Unit,
    onChange: () -> Unit,
    onBreak: () -> Unit,
    onResume: () -> Unit,
    onEnd: () -> Unit,
) {
    val currentName = activities.firstOrNull { it.activityId == currentInterval?.activityId }?.title
        ?: if (currentInterval?.entryType == "BREAK") "On a break" else "Unassigned"
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Text(if (active) "Workday in progress" else "No active workday", style = MaterialTheme.typography.titleLarge)
        if (active) {
            Text("Current: $currentName")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onChange, enabled = currentInterval?.entryType != "BREAK") { Text("Change activity") }
                Button(onClick = onBreak, enabled = currentInterval?.entryType != "BREAK") { Text("Break") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onResume, enabled = currentInterval?.entryType == "BREAK") { Text("Resume activity") }
                OutlinedButton(onClick = onEnd) { Text("End workday") }
            }
        } else {
            Button(onClick = onStart) { Text("Start workday") }
        }
        Spacer(Modifier.height(2.dp))
    }
}

@Composable
private fun ActivityPicker(
    activities: List<ActivitySnapshotEntity>,
    selectedId: String?,
    onSelected: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = activities.firstOrNull { it.activityId == selectedId }?.title ?: "Unassigned"
    Column {
        Text("Activity")
        OutlinedButton(onClick = { expanded = true }) { Text(selectedName) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text("Unassigned") }, onClick = { onSelected(null); expanded = false })
            activities.filterNot { it.isArchived }.forEach { activity ->
                DropdownMenuItem(text = { Text(activity.title) }, onClick = { onSelected(activity.activityId); expanded = false })
            }
        }
    }
}
