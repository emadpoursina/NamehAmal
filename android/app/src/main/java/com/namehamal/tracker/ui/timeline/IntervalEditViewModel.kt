package com.namehamal.tracker.ui.timeline

import com.namehamal.tracker.data.local.TimelineRepository
import java.time.Instant

class IntervalEditViewModel(private val repository: TimelineRepository) {
    suspend fun save(entryId: String, startMillis: Long, endMillis: Long, activityId: String?) =
        repository.editInterval(entryId, Instant.ofEpochMilli(startMillis), Instant.ofEpochMilli(endMillis), activityId)

    suspend fun split(entryId: String, boundary: Instant) = repository.splitInterval(entryId, boundary)
}
