package com.namehamal.tracker.ui.timeline

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.TimeIntervalEntity
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TimelineScreen(
    intervals: List<TimeIntervalEntity>,
    activities: List<ActivitySnapshotEntity>,
    onEdit: (TimeIntervalEntity, Long, Long, String?) -> Unit,
    onSplit: (TimeIntervalEntity, Instant) -> Unit,
    onConfirm: (TimeIntervalEntity) -> Unit,
) {
    var selected by remember { mutableStateOf<TimeIntervalEntity?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(16.dp)) {
        Text("Timeline", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            intervals.forEach { interval ->
                val localStart = Instant.ofEpochMilli(interval.startedAt).atZone(ZoneId.systemDefault())
                val localEnd = interval.endedAt?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()) }
                val activityTitle = activities.firstOrNull { it.activityId == interval.activityId }?.title
                    ?: if (interval.activityId == null) "Unassigned" else "Unknown activity"
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("$activityTitle · ${interval.entryType}")
                        Text("${localStart.format(timeFormatter)} – ${localEnd?.format(timeFormatter) ?: "Now"} (local time)")
                        Text(if (interval.confirmationState == "UNCONFIRMED") "Unconfirmed" else "Confirmed")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (interval.endedAt != null) TextButton(onClick = { selected = interval }) { Text("Edit / split") }
                            if (interval.confirmationState == "UNCONFIRMED") Button(onClick = { onConfirm(interval) }) { Text("Review") }
                        }
                    }
                }
            }
        }
    }
    selected?.let { interval ->
        IntervalEditor(
            interval = interval,
            activities = activities,
            onDismiss = { selected = null },
            onSave = { start, end, activity -> onEdit(interval, start, end, activity); selected = null },
            onSplit = { boundary -> onSplit(interval, boundary); selected = null },
        )
    }
}

private val timeFormatter = DateTimeFormatter.ofPattern("MMM d, HH:mm")
