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
import com.namehamal.tracker.notifications.SessionCheckInScheduler
import com.namehamal.tracker.ui.sync.SyncSettingsViewModel
import com.namehamal.tracker.ui.tracking.TrackingViewModel
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

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
    lateinit var sessionCheckInScheduler: SessionCheckInScheduler
        private set

    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        // Cancel any workday check-ins left by an earlier installation before showing UI.
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
        sessionCheckInScheduler = SessionCheckInScheduler(this)
        // Resume reminders for a session that survived an app restart, or clear stale work.
        applicationScope.launch {
            val running = timelineRepository.runningSessionId()
            if (running != null) {
                sessionCheckInScheduler.schedule(running)
            } else {
                sessionCheckInScheduler.cancelAll()
            }
        }
    }

    fun syncSettingsViewModel(): SyncSettingsViewModel =
        SyncSettingsViewModel(savedDesktopEndpoint, syncRepository)

    fun trackingViewModel(): TrackingViewModel = TrackingViewModel(
        repository = timelineRepository,
        onSessionStarted = { entryId -> sessionCheckInScheduler.schedule(entryId) },
        onSessionStopped = { sessionCheckInScheduler.cancelAll() },
    )

    private fun installationId(): String {
        val preferences = getSharedPreferences("tracker-installation", MODE_PRIVATE)
        return preferences.getString("device-id", null) ?: UUID.randomUUID().toString().also {
            preferences.edit().putString("device-id", it).apply()
        }
    }
}
