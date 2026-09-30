package com.namehamal.tracker.ui.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.SessionRepository
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.domain.SessionRules
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class TrackingUiState(
    val title: String = "",
    val startedAtLocal: String = "",
    val endedAtLocal: String = "",
    val activities: List<ActivitySnapshotEntity> = emptyList(),
    val selectedActivityId: String? = null,
    val categories: List<CategorySnapshotEntity> = emptyList(),
    val selectedCategoryId: String? = null,
    val events: List<TimeIntervalEntity> = emptyList(),
    val titleSuggestions: List<String> = emptyList(),
    val nowMillis: Long = 0,
    val message: String? = null,
    val isError: Boolean = false,
    val pendingRemoval: TimeIntervalEntity? = null,
    val selectedEntryIds: Set<String> = emptySet(),
    val pendingBulkRemovalIds: Set<String>? = null,
    val confirmClearAll: Boolean = false,
    val confirmClearSynced: Boolean = false,
) {
    val runningSession: TimeIntervalEntity? get() = events.firstOrNull { it.endedAt == null }
    val syncedEventCount: Int get() = events.count { it.syncedAt != null }
}

/**
 * UI state and local actions for the single all-dates tracking surface.
 * Time input is interpreted in the device's current timezone.
 */
class TrackingViewModel(
    private val repository: SessionRepository,
    private val now: () -> Instant = { Instant.now() },
    private val zoneId: () -> ZoneId = { ZoneId.systemDefault() },
    private val onSessionStarted: (String) -> Unit = {},
    private val onSessionStopped: () -> Unit = {},
    coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val scope = coroutineScope ?: viewModelScope
    private val mutable = MutableStateFlow(initialState())
    val state: StateFlow<TrackingUiState> = mutable.asStateFlow()

    init {
        scope.launch {
            combine(repository.observeActivities(), repository.observeCategories()) { activities, categories ->
                val availableCategoryIds = categories.mapTo(mutableSetOf()) { it.categoryId }
                activities.filter { it.categoryId in availableCategoryIds }
            }.collect { activities ->
                val selected = mutable.value.selectedActivityId
                    ?.takeIf { id -> activities.any { it.activityId == id } }
                mutable.value = mutable.value.copy(activities = activities, selectedActivityId = selected)
            }
        }
        scope.launch {
            repository.observeCategories().collect { categories ->
                val selected = mutable.value.selectedCategoryId
                    ?.takeIf { id -> categories.any { it.categoryId == id } }
                mutable.value = mutable.value.copy(categories = categories, selectedCategoryId = selected)
            }
        }
        scope.launch {
            repository.observeEvents().collect { rows ->
                val current = mutable.value
                val sorted = SessionFeedRules.newestFirst(rows)
                val visibleIds = sorted.mapTo(mutableSetOf()) { it.entryId }
                mutable.value = current.copy(
                    events = sorted,
                    selectedEntryIds = current.selectedEntryIds.intersect(visibleIds),
                )
            }
        }
        scope.launch {
            repository.observeTitleSuggestions().collect { titles ->
                mutable.value = mutable.value.copy(titleSuggestions = titles)
            }
        }
        scope.launch {
            while (isActive) {
                mutable.value = mutable.value.copy(nowMillis = now().toEpochMilli())
                delay(1_000)
            }
        }
    }

    fun editTitle(value: String) = edit {
        val keepsSavedActivity = selectedActivityId?.let { id ->
            activities.any { it.activityId == id && it.title == value }
        } == true
        copy(
            title = value,
            selectedActivityId = selectedActivityId.takeIf { keepsSavedActivity },
            message = null,
            isError = false,
        )
    }

    fun selectActivity(activityId: String) {
        val current = mutable.value
        val activity = current.activities.firstOrNull { it.activityId == activityId } ?: return
        val category = current.categories.firstOrNull { it.categoryId == activity.categoryId }
        if (category == null) {
            mutable.value = current.copy(
                message = "Sync with desktop to refresh this activity's category.",
                isError = true,
            )
            return
        }
        mutable.value = current.copy(
            title = activity.title,
            selectedActivityId = activity.activityId,
            selectedCategoryId = category.categoryId,
            message = null,
            isError = false,
        )
    }

    fun selectRecentTitle(title: String) {
        val current = mutable.value
        val matchingActivity = current.activities.firstOrNull { it.title == title }
        if (matchingActivity != null) {
            selectActivity(matchingActivity.activityId)
            return
        }
        val previousCategory = current.events.firstOrNull { it.title.trim() == title.trim() }
            ?.categoryId
            ?.takeIf { id -> current.categories.any { it.categoryId == id } }
        mutable.value = current.copy(
            title = title,
            selectedActivityId = null,
            selectedCategoryId = previousCategory ?: current.selectedCategoryId,
            message = null,
            isError = false,
        )
    }
    fun editStartedAt(value: String) = edit { copy(startedAtLocal = value, message = null, isError = false) }
    fun editEndedAt(value: String) = edit { copy(endedAtLocal = value, message = null, isError = false) }
    fun selectCategory(categoryId: String?) = edit {
        val selected = categoryId?.takeIf { id -> categories.any { it.categoryId == id } }
        val matchingActivity = selectedActivityId?.takeIf { id ->
            activities.any { it.activityId == id && it.categoryId == selected }
        }
        copy(
            selectedCategoryId = selected,
            selectedActivityId = matchingActivity,
            message = null,
            isError = false,
        )
    }

    fun saveCompleted() {
        val current = mutable.value
        val categoryId = requireSelectedCategory(current) ?: return
        launchAction {
            repository.createCompletedSession(
                current.title,
                current.startedAtLocal,
                current.endedAtLocal,
                categoryId,
                zoneId().id,
                now(),
                current.selectedActivityId,
            )
            mutable.value = mutable.value.copy(
                message = "Session saved.",
                isError = false,
            )
        }
    }

    fun start() {
        val current = mutable.value
        val categoryId = requireSelectedCategory(current) ?: return
        launchAction {
            val session = repository.startSession(
                current.title,
                current.startedAtLocal,
                categoryId,
                zoneId().id,
                now(),
                current.selectedActivityId,
            )
            onSessionStarted(session.entryId)
            mutable.value = mutable.value.copy(message = "Session started.", isError = false)
        }
    }

    fun prepareRestart(event: TimeIntervalEntity) {
        val start = SessionRules.formatLocalDateTime(now(), zoneId())
        val selectedCategoryId = event.categoryId
            ?.takeIf { id -> mutable.value.categories.any { it.categoryId == id } }
        val selectedActivityId = event.activityId?.takeIf { id ->
            mutable.value.activities.any {
                it.activityId == id && it.title == event.title && it.categoryId == selectedCategoryId
            }
        }
        mutable.value = mutable.value.copy(
            title = event.title,
            startedAtLocal = start,
            selectedCategoryId = selectedCategoryId,
            selectedActivityId = selectedActivityId,
            message = if (selectedCategoryId == null) {
                "Choose an available category before starting this session again."
            } else {
                "${event.title} is ready to restart with its saved category."
            },
            isError = selectedCategoryId == null,
        )
    }

    fun stop(entryId: String) {
        launchAction {
            repository.stopSession(entryId, now())
            onSessionStopped()
            mutable.value = mutable.value.copy(message = "Session stopped.", isError = false)
        }
    }

    fun requestRemove(event: TimeIntervalEntity) {
        mutable.value = mutable.value.copy(pendingRemoval = event, message = null, isError = false)
    }

    fun cancelRemove() {
        mutable.value = mutable.value.copy(pendingRemoval = null)
    }

    fun toggleSelection(entryId: String) {
        val current = mutable.value
        if (current.events.none { it.entryId == entryId }) return
        val selected = current.selectedEntryIds.toMutableSet()
        if (!selected.add(entryId)) selected.remove(entryId)
        mutable.value = current.copy(selectedEntryIds = selected)
    }

    fun selectAll() {
        mutable.value = mutable.value.copy(selectedEntryIds = mutable.value.events.mapTo(mutableSetOf()) { it.entryId })
    }

    fun clearSelection() {
        mutable.value = mutable.value.copy(selectedEntryIds = emptySet())
    }

    fun requestRemoveSelected() {
        val current = mutable.value
        val visibleIds = current.events.mapTo(mutableSetOf()) { it.entryId }
        val selected = current.selectedEntryIds.intersect(visibleIds)
        if (selected.isEmpty()) return
        mutable.value = current.copy(pendingBulkRemovalIds = selected)
    }

    fun cancelRemoveSelected() {
        mutable.value = mutable.value.copy(pendingBulkRemovalIds = null)
    }

    fun confirmRemoveSelected() {
        val ids = mutable.value.pendingBulkRemovalIds ?: return
        val runningRemoved = mutable.value.events.any { it.entryId in ids && it.endedAt == null }
        launchAction {
            val removed = repository.removeSessions(ids)
            if (runningRemoved) onSessionStopped()
            mutable.value = mutable.value.copy(
                pendingBulkRemovalIds = null,
                selectedEntryIds = mutable.value.selectedEntryIds - ids,
                message = "$removed ${if (removed == 1) "session" else "sessions"} removed from this device.",
                isError = false,
            )
        }
    }

    fun requestClearAll() {
        mutable.value = mutable.value.copy(confirmClearAll = true)
    }

    fun cancelClearAll() {
        mutable.value = mutable.value.copy(confirmClearAll = false)
    }

    fun confirmClearAll() {
        if (!mutable.value.confirmClearAll) return
        val runningRemoved = mutable.value.events.any { it.endedAt == null }
        launchAction {
            val removed = repository.clearAllSessions()
            if (runningRemoved) onSessionStopped()
            mutable.value = mutable.value.copy(
                confirmClearAll = false,
                selectedEntryIds = emptySet(),
                message = "$removed ${if (removed == 1) "session" else "sessions"} cleared from this device.",
                isError = false,
            )
        }
    }

    fun confirmRemove() {
        val event = mutable.value.pendingRemoval ?: return
        val runningRemoved = event.endedAt == null
        launchAction {
            repository.removeSession(event.entryId)
            if (runningRemoved) onSessionStopped()
            mutable.value = mutable.value.copy(
                pendingRemoval = null,
                message = "Session removed from this device.",
                isError = false,
            )
        }
    }

    fun requestClearSynced() {
        mutable.value = mutable.value.copy(confirmClearSynced = true, message = null, isError = false)
    }

    fun cancelClearSynced() {
        mutable.value = mutable.value.copy(confirmClearSynced = false)
    }

    fun confirmClearSynced() {
        if (!mutable.value.confirmClearSynced) return
        launchAction {
            val removed = repository.clearSyncedSessions()
            mutable.value = mutable.value.copy(
                confirmClearSynced = false,
                message = "$removed synced ${if (removed == 1) "session" else "sessions"} removed from this device.",
                isError = false,
            )
        }
    }

    private fun launchAction(action: suspend () -> Unit) {
        scope.launch {
            runCatching { action() }.onFailure { error ->
                mutable.value = mutable.value.copy(
                    message = error.message ?: "Could not save this session.",
                    isError = true,
                )
            }
        }
    }

    private fun requireSelectedCategory(current: TrackingUiState): String? {
        val selected = current.selectedCategoryId
            ?.takeIf { id -> current.categories.any { it.categoryId == id } }
        if (selected == null) {
            mutable.value = current.copy(
                selectedCategoryId = null,
                message = "Choose an available category before saving or starting a session.",
                isError = true,
            )
        }
        return selected
    }

    private inline fun edit(transform: TrackingUiState.() -> TrackingUiState) {
        mutable.value = mutable.value.transform()
    }

    private fun initialState(): TrackingUiState {
        val current = LocalDateTime.ofInstant(now(), zoneId())
        val start = current.minusHours(1)
        return TrackingUiState(
            startedAtLocal = SessionRules.formatLocalDateTime(start.atZone(zoneId()).toInstant(), zoneId()),
            endedAtLocal = SessionRules.formatLocalDateTime(current.atZone(zoneId()).toInstant(), zoneId()),
            nowMillis = now().toEpochMilli(),
        )
    }
}

object SessionFeedRules {
    fun newestFirst(events: List<TimeIntervalEntity>): List<TimeIntervalEntity> =
        events.sortedWith(compareByDescending<TimeIntervalEntity> { it.startedAt }.thenByDescending { it.entryId })

    fun previousTitles(events: List<TimeIntervalEntity>): List<String> = newestFirst(events)
        .asSequence()
        .map { it.title.trim() }
        .filter(String::isNotEmpty)
        .distinct()
        .toList()
}
