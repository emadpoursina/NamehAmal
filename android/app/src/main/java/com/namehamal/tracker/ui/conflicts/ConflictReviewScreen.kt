package com.namehamal.tracker.ui.conflicts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.ConflictResolutionEntity
import com.namehamal.tracker.data.local.SyncConflictEntity
import com.namehamal.tracker.data.sync.ConflictResolutionRepository
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

private fun formatInstant(millis: Long?): String {
    if (millis == null) return "—"
    return DateTimeFormatter.ofPattern("MMM d, HH:mm")
        .withZone(ZoneId.systemDefault())
        .format(Instant.ofEpochMilli(millis))
}

internal fun conflictTitle(conflict: SyncConflictEntity): String = when (conflict.conflictType) {
    "CONCURRENT_EDIT" -> "Competing edits need your choice"
    else -> "Overlapping entries need review"
}

/**
 * Persistent Review conflicts list (T040). Unresolved overlaps and competing
 * versions stay visible until the user resolves them; originals stay inspectable.
 */
@Composable
fun ConflictReviewScreen(repository: ConflictResolutionRepository) {
    val conflicts by repository.observeVisibleConflicts().collectAsState(initial = emptyList())
    var selected by remember { mutableStateOf<SyncConflictEntity?>(null) }
    var history by remember { mutableStateOf<List<ConflictResolutionEntity>>(emptyList()) }
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Review conflicts", style = MaterialTheme.typography.titleLarge)
        Text(
            "Shared time is never double-counted. Original records are kept; " +
                "resolutions can be undone.",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (conflicts.isEmpty()) {
            Text(
                "No unresolved conflicts.",
                modifier = Modifier.padding(top = 16.dp),
                style = MaterialTheme.typography.bodyMedium,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(conflicts, key = { it.conflictId }) { conflict ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(conflictTitle(conflict), style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Overlap: ${formatInstant(conflict.overlapStartAt)} – ${formatInstant(conflict.overlapEndAt)}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                            Text("State: ${conflict.state}", style = MaterialTheme.typography.bodySmall)
                            Button(onClick = {
                                selected = conflict
                                scope.launch { history = repository.history(conflict.conflictId) }
                            }) {
                                Text("Review")
                            }
                        }
                    }
                }
            }
        }
    }

    selected?.let { conflict ->
        ConflictResolutionSheet(
            conflict = conflict,
            history = history,
            onDismiss = { selected = null },
            onKeepFirst = { revisionId ->
                scope.launch {
                    repository.keepVersion(conflict.conflictId, revisionId)
                    selected = null
                }
            },
            onUnassigned = { entryId ->
                scope.launch {
                    repository.assignUnassigned(conflict.conflictId, entryId)
                    selected = null
                }
            },
            onUndo = { undoesId ->
                scope.launch {
                    repository.undo(conflict.conflictId, undoesId)
                    selected = null
                }
            },
        )
    }
}

