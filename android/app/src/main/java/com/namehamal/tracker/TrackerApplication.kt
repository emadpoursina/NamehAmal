package com.namehamal.tracker

import android.app.Application
import androidx.room.withTransaction
import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.data.local.TrackerDatabase
import com.namehamal.tracker.data.sync.AndroidSyncApi
import com.namehamal.tracker.data.sync.ConflictResolutionRepository
import com.namehamal.tracker.data.sync.HttpAndroidSyncApi
import com.namehamal.tracker.data.sync.SavedDesktopEndpoint
import com.namehamal.tracker.data.sync.SyncRepository
import com.namehamal.tracker.notifications.CheckInScheduler
import com.namehamal.tracker.ui.sync.SyncSettingsViewModel
import com.namehamal.tracker.ui.tracking.TrackingViewModel
import java.util.UUID

class TrackerApplication : Application() {
    lateinit var database: TrackerDatabase
        private set
    lateinit var timelineRepository: TimelineRepository
        private set
    lateinit var syncRepository: SyncRepository
        private set
    lateinit var conflictResolutionRepository: ConflictResolutionRepository
        private set
    lateinit var savedDesktopEndpoint: SavedDesktopEndpoint
        private set
    lateinit var syncApi: AndroidSyncApi
        private set

    override fun onCreate() {
        super.onCreate()
        // Workday/check-in tracking is retired in the simplified app. Cancel work
        // that may have been scheduled by an earlier installation before showing UI.
        CheckInScheduler(this).cancel()
        database = TrackerDatabase.getInstance(this)
        timelineRepository = TimelineRepository(database, installationId())
        syncApi = HttpAndroidSyncApi()
        val deviceId = installationId()
        syncRepository = SyncRepository(
            timelineDao = database.workdayDao(),
            categoryDao = database.categoryDao(),
            syncDao = database.syncDao(),
            conflictDao = database.conflictDao(),
            api = syncApi,
            deviceId = { deviceId },
            transaction = { block -> database.withTransaction(block) },
        )
        conflictResolutionRepository = ConflictResolutionRepository(
            timelineDao = database.workdayDao(),
            syncDao = database.syncDao(),
            conflictDao = database.conflictDao(),
            deviceId = { deviceId },
            transaction = { block -> database.withTransaction(block) },
        )
        savedDesktopEndpoint = SavedDesktopEndpoint(this)
    }

    fun syncSettingsViewModel(): SyncSettingsViewModel =
        SyncSettingsViewModel(savedDesktopEndpoint, syncRepository)

    fun trackingViewModel(): TrackingViewModel = TrackingViewModel(timelineRepository)

    private fun installationId(): String {
        val preferences = getSharedPreferences("tracker-installation", MODE_PRIVATE)
        return preferences.getString("device-id", null) ?: UUID.randomUUID().toString().also {
            preferences.edit().putString("device-id", it).apply()
        }
    }
}
