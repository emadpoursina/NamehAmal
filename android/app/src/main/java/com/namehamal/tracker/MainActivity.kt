package com.namehamal.tracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.namehamal.tracker.ui.sync.SyncSettingsScreen
import com.namehamal.tracker.ui.sync.SyncSettingsViewModel
import com.namehamal.tracker.ui.tracking.TrackingScreen
import com.namehamal.tracker.ui.tracking.TrackingViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tracker = application as TrackerApplication
        val factory = TrackerViewModelFactory(tracker)
        val trackingViewModel = ViewModelProvider(this, factory)[TrackingViewModel::class.java]
        val syncSettingsViewModel = ViewModelProvider(this, factory)[SyncSettingsViewModel::class.java]
        setContent {
            var showingSettings by rememberSaveable { mutableStateOf(false) }
            MaterialTheme {
                Surface {
                    if (showingSettings) {
                        SyncSettingsScreen(syncSettingsViewModel, onBack = { showingSettings = false })
                    } else {
                        TrackingScreen(
                            viewModel = trackingViewModel,
                            syncViewModel = syncSettingsViewModel,
                            onOpenSettings = { showingSettings = true },
                        )
                    }
                }
            }
        }
    }
}

private class TrackerViewModelFactory(
    private val tracker: TrackerApplication,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        val created: ViewModel = when {
            modelClass.isAssignableFrom(TrackingViewModel::class.java) -> tracker.trackingViewModel()
            modelClass.isAssignableFrom(SyncSettingsViewModel::class.java) -> tracker.syncSettingsViewModel()
            else -> throw IllegalArgumentException("Unknown tracker ViewModel: ${modelClass.name}")
        }
        @Suppress("UNCHECKED_CAST")
        return created as T
    }
}
