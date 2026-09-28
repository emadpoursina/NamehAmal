package com.namehamal.tracker.ui.tracking

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class TrackingUiState(
    val title: String = "",
    val startedAtLocal: String = "",
    val endedAtLocal: String = "",
    val events: List<TimeIntervalEntity> = emptyList(),
    val titleSuggestions: List<String> = emptyList(),
    val nowMillis: Long = 0,
    val message: String? = null,
    val isError: Boolean = false,
    val pendingRemoval: TimeIntervalEntity? = null,
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
    coroutineScope: CoroutineScope? = null,
) : ViewModel() {
    private val scope = coroutineScope ?: viewModelScope
    private val mutable = MutableStateFlow(initialState())
    val state: StateFlow<TrackingUiState> = mutable.asStateFlow()

    init {
        scope.launch {
            repository.observeEvents().collect { rows ->
                mutable.value = mutable.value.copy(events = SessionFeedRules.newestFirst(rows))
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

    fun editTitle(value: String) = edit { copy(title = value, message = null, isError = false) }
    fun editStartedAt(value: String) = edit { copy(startedAtLocal = value, message = null, isError = false) }
    fun editEndedAt(value: String) = edit { copy(endedAtLocal = value, message = null, isError = false) }

    fun saveCompleted() {
        val current = mutable.value
        launchAction {
            repository.createCompletedSession(
                current.title,
                current.startedAtLocal,
                current.endedAtLocal,
                zoneId().id,
                now(),
            )
            mutable.value = mutable.value.copy(
                message = "Session saved.",
                isError = false,
            )
        }
    }

    fun start() {
        val current = mutable.value
        launchAction {
            repository.startSession(current.title, current.startedAtLocal, zoneId().id, now())
            mutable.value = mutable.value.copy(message = "Session started.", isError = false)
        }
    }

    fun startAgain(title: String) {
        val start = SessionRules.formatLocalDateTime(now(), zoneId())
        launchAction {
            repository.startSession(title, start, zoneId().id, now())
            mutable.value = mutable.value.copy(
                title = title,
                startedAtLocal = start,
                message = "Started a new session: ${title.trim()}.",
                isError = false,
            )
        }
    }

    fun stop(entryId: String) {
        launchAction {
            repository.stopSession(entryId, now())
            mutable.value = mutable.value.copy(message = "Session stopped.", isError = false)
        }
    }

    fun requestRemove(event: TimeIntervalEntity) {
        mutable.value = mutable.value.copy(pendingRemoval = event, message = null, isError = false)
    }

    fun cancelRemove() {
        mutable.value = mutable.value.copy(pendingRemoval = null)
    }

    fun confirmRemove() {
        val event = mutable.value.pendingRemoval ?: return
        launchAction {
            repository.removeSession(event.entryId)
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
