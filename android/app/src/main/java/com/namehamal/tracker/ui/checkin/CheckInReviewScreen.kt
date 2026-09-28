package com.namehamal.tracker.ui.checkin

import androidx.compose.runtime.Composable
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.ui.timeline.TimelineScreen
import java.time.Instant

@Composable
fun CheckInReviewScreen(
    intervals: List<TimeIntervalEntity>,
    activities: List<ActivitySnapshotEntity>,
    onEdit: (TimeIntervalEntity, Long, Long, String?) -> Unit,
    onSplit: (TimeIntervalEntity, Instant) -> Unit,
    onConfirm: (TimeIntervalEntity) -> Unit,
) {
    TimelineScreen(intervals, activities, onEdit, onSplit, onConfirm)
}
