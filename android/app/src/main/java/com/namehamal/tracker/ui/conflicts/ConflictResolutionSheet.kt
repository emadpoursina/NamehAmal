package com.namehamal.tracker.ui.conflicts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.namehamal.tracker.data.local.ConflictResolutionEntity
import com.namehamal.tracker.data.local.SyncConflictEntity

/** Bottom sheet with keep/split/edit/Unassigned choices and undo (T040). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConflictResolutionSheet(
    conflict: SyncConflictEntity,
    history: List<ConflictResolutionEntity>,
    onDismiss: () -> Unit,
    onKeepFirst: (String) -> Unit,
    onUnassigned: (String) -> Unit,
    onUndo: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val revisionIds = remember(conflict) {
        try {
            com.namehamal.tracker.data.sync.SyncJson
                .asList(com.namehamal.tracker.data.sync.SyncJson.parse(conflict.revisionIdsJson))
                .mapNotNull { it as? String }
        } catch (_: IllegalArgumentException) {
            emptyList()
        }
    }
    val entryIds = remember(conflict) {
        try {
            com.namehamal.tracker.data.sync.SyncJson
                .asList(com.namehamal.tracker.data.sync.SyncJson.parse(conflict.entryIdsJson))
                .mapNotNull { it as? String }
        } catch (_: IllegalArgumentException) {
            emptyList()
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(conflictTitle(conflict), style = MaterialTheme.typography.titleMedium)
            Text(
                "Both versions are preserved. Splitting and editing happen on the timeline; " +
                    "the result syncs as a new revision.",
                style = MaterialTheme.typography.bodySmall,
            )
            revisionIds.forEach { revisionId ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Version ${revisionId.take(8)}",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    OutlinedButton(onClick = { onKeepFirst(revisionId) }) { Text("Keep") }
                }
            }
            entryIds.forEach { entryId ->
                OutlinedButton(
                    onClick = { onUnassigned(entryId) },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Assign ${entryId.take(8)} to Unassigned") }
            }
            if (history.isNotEmpty()) {
                Text("History", style = MaterialTheme.typography.titleSmall)
                history.forEach { record ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "${record.action} · ${record.resolutionId.take(8)}",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                        )
                        if (record.action != "UNDO") {
                            OutlinedButton(onClick = { onUndo(record.resolutionId) }) {
                                Text("Undo")
                            }
                        }
                    }
                }
            }
        }
    }
}
