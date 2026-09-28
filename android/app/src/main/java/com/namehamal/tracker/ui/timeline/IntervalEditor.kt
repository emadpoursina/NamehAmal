package com.namehamal.tracker.ui.timeline

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import java.time.Instant

@Composable
fun IntervalEditor(
    interval: TimeIntervalEntity,
    activities: List<ActivitySnapshotEntity>,
    onDismiss: () -> Unit,
    onSave: (Long, Long, String?) -> Unit,
    onSplit: (Instant) -> Unit,
) {
    var start by remember(interval.entryId) { mutableStateOf(interval.startedAt.toString()) }
    var end by remember(interval.entryId) { mutableStateOf(interval.endedAt?.toString().orEmpty()) }
    var activity by remember(interval.entryId) { mutableStateOf(interval.activityId.orEmpty()) }
    var activityMenu by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit interval") },
        text = {
            Column {
                Text("Enter start and end as UTC epoch milliseconds. Leave activity blank for Unassigned.")
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(start, { start = it }, label = { Text("Start (UTC ms)") }, singleLine = true)
                OutlinedTextField(end, { end = it }, label = { Text("End (UTC ms)") }, singleLine = true)
                OutlinedButton(onClick = { activityMenu = true }) {
                    Text(activities.firstOrNull { it.activityId == activity }?.title ?: "Unassigned")
                }
                DropdownMenu(expanded = activityMenu, onDismissRequest = { activityMenu = false }) {
                    DropdownMenuItem(text = { Text("Unassigned") }, onClick = { activity = ""; activityMenu = false })
                    activities.filterNot { it.isArchived }.forEach { item ->
                        DropdownMenuItem(text = { Text(item.title) }, onClick = { activity = item.activityId; activityMenu = false })
                    }
                }
                error?.let { Text(it) }
            }
        },
        confirmButton = {
            Column {
                Button(onClick = {
                    runCatching {
                        val startAt = start.toLong()
                        val endAt = end.toLong()
                        require(endAt > startAt) { "End must be after start." }
                        onSave(startAt, endAt, activity.trim().ifEmpty { null })
                    }.onFailure { error = it.message ?: "Invalid interval." }
                }) { Text("Save") }
                val endAt = end.toLongOrNull()
                val startAt = start.toLongOrNull()
                if (endAt != null && startAt != null && endAt - startAt > 1_000) {
                    TextButton(onClick = { onSplit(Instant.ofEpochMilli(startAt + (endAt - startAt) / 2)) }) {
                        Text("Split at midpoint")
                    }
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
