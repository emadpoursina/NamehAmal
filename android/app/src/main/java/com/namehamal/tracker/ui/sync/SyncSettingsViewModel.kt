package com.namehamal.tracker.ui.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.namehamal.tracker.data.sync.DesktopEndpoint
import com.namehamal.tracker.data.sync.SavedDesktopEndpoint
import com.namehamal.tracker.data.sync.SyncFailureKind
import com.namehamal.tracker.data.sync.SyncOutcome
import com.namehamal.tracker.data.sync.SyncRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** UI state for the manual sync settings screen (T033). */
data class SyncUiState(
    val host: String = "",
    val port: String = "3061",
    val savedEndpoint: DesktopEndpoint? = null,
    val message: String? = null,
    val isError: Boolean = false,
    val isSyncing: Boolean = false,
    val pendingCount: Int = 0,
)

class SyncSettingsViewModel(
    private val endpointStore: SavedDesktopEndpoint,
    private val syncRepository: SyncRepository,
) : ViewModel() {
    private val mutable = MutableStateFlow(SyncUiState())
    val state: StateFlow<SyncUiState> = mutable.asStateFlow()

    init {
        viewModelScope.launch {
            endpointStore.endpoint.collect { saved ->
                val current = mutable.value
                mutable.value = current.copy(
                    savedEndpoint = saved,
                    host = saved?.host ?: current.host,
                    port = saved?.port?.toString() ?: current.port,
                    pendingCount = syncRepository.pendingCount(),
                )
            }
        }
    }

    fun editHost(host: String) {
        mutable.value = mutable.value.copy(host = host, message = null, isError = false)
    }

    fun editPort(port: String) {
        mutable.value = mutable.value.copy(port = port, message = null, isError = false)
    }

    fun save() {
        val current = mutable.value
        val port = current.port.toIntOrNull()
        if (port == null) {
            mutable.value = current.copy(message = "Enter a port between 1 and 65535.", isError = true)
            return
        }
        viewModelScope.launch {
            val problem = endpointStore.save(current.host, port)
            mutable.value = if (problem == null) {
                mutable.value.copy(message = "Saved. Tap Sync to refresh desktop categories/activities and upload completed sessions.", isError = false)
            } else {
                mutable.value.copy(message = problem, isError = true)
            }
        }
    }

    fun forget() {
        viewModelScope.launch {
            endpointStore.forget()
            mutable.value = mutable.value.copy(
                savedEndpoint = null,
                message = "Endpoint forgotten on this app. Enter the address again to sync.",
                isError = false,
            )
        }
    }

    /** Explicit user-started sync. Nothing else in the app calls this. */
    fun syncNow() {
        val current = mutable.value
        viewModelScope.launch {
            val saved = endpointStore.endpoint.first() ?: run {
                mutable.value = current.copy(
                    message = "Save the server address and port first.",
                    isError = true,
                )
                return@launch
            }
            mutable.value = mutable.value.copy(isSyncing = true, message = null, isError = false)
            val outcome = syncRepository.syncUploadOnly(saved)
            mutable.value = when (outcome) {
                is SyncOutcome.Success -> mutable.value.copy(
                    isSyncing = false,
                    message = "Sync complete: categories and activities refreshed; ${outcome.uploadedRevisions} session(s) acknowledged by desktop.",
                    isError = false,
                    pendingCount = syncRepository.pendingCount(),
                )
                is SyncOutcome.Failed -> mutable.value.copy(
                    isSyncing = false,
                    message = if (outcome.kind == SyncFailureKind.VERSION) {
                        outcome.message
                    } else {
                        "${outcome.message} Nothing was lost; retry."
                    },
                    isError = true,
                    pendingCount = syncRepository.pendingCount(),
                )
            }
        }
    }
}
