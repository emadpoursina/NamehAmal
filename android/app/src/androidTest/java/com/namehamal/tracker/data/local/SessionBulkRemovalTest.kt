package com.namehamal.tracker.data.local

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.namehamal.tracker.data.sync.DesktopEndpoint
import com.namehamal.tracker.data.sync.SavedDesktopEndpoint
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SessionBulkRemovalTest {
    private lateinit var database: TrackerDatabase
    private lateinit var context: Context
    private val databaseName = "session-bulk-removal-test.db"

    @Before
    fun createDatabase() = runBlocking {
        context = ApplicationProvider.getApplicationContext()
        context.deleteDatabase(databaseName)
        database = Room.databaseBuilder(context, TrackerDatabase::class.java, databaseName)
            .addMigrations(*DatabaseMigrations.ALL)
            .allowMainThreadQueries()
            .build()
        database.categoryDao().upsert(CategorySnapshotEntity("work", "Work", 0, false, 1L))
    }

    @After
    fun closeDatabase() {
        database.close()
        context.deleteDatabase(databaseName)
    }

    @Test
    fun selectedAndAllRemovalDeleteSessionsAndRevisionsButKeepCategoryAndEndpoint() = runBlocking {
        val endpointScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val endpointFile = File(context.cacheDir, "endpoint-bulk-test-${UUID.randomUUID()}.preferences_pb")
        val endpointStore = SavedDesktopEndpoint(
            PreferenceDataStoreFactory.create(scope = endpointScope) { endpointFile },
        )
        val savedEndpoint = DesktopEndpoint("192.168.1.20", 3061)
        assertNull(endpointStore.save(savedEndpoint.host, savedEndpoint.port))

        val repository = TimelineRepository(database, "test-device")
        val now = Instant.parse("2026-09-27T12:00:00Z")
        val selected = repository.createCompletedSession(
            "Selected", "2026-09-27 08:00", "2026-09-27 09:00", "work", "UTC", now,
        )
        val remaining = repository.createCompletedSession(
            "Remaining", "2026-09-27 09:00", "2026-09-27 10:00", "work", "UTC", now,
        )
        val running = repository.startSession("Running", "2026-09-27 11:00", "work", "UTC", now)
        val syncDao = database.syncDao()
        syncDao.insertRevision(revision("selected-revision", selected))
        syncDao.insertRevision(revision("remaining-revision", remaining))

        assertEquals(2, repository.removeSessions(setOf(selected.entryId, running.entryId)))
        assertNull(database.workdayDao().getInterval(selected.entryId))
        assertNull(database.workdayDao().getInterval(running.entryId))
        assertNull(syncDao.getLatestRevision(selected.entryId))
        assertEquals(remaining, database.workdayDao().getInterval(remaining.entryId))
        assertEquals("remaining-revision", syncDao.getLatestRevision(remaining.entryId)?.revisionId)
        assertEquals(listOf(CategorySnapshotEntity("work", "Work", 0, false, 1L)), database.categoryDao().getAllCategories())
        assertEquals(savedEndpoint, endpointStore.endpoint.first())
        assertTrue(syncDao.getPendingRevisions().none { it.deletedAt != null })

        assertEquals(1, repository.clearAllSessions())
        assertNull(database.workdayDao().getInterval(remaining.entryId))
        assertNull(syncDao.getLatestRevision(remaining.entryId))
        assertTrue(syncDao.getPendingRevisions().isEmpty())
        assertFalse(database.categoryDao().getAllCategories().isEmpty())
        assertEquals(savedEndpoint, endpointStore.endpoint.first())

        endpointScope.cancel()
        endpointFile.delete()
    }

    private fun revision(revisionId: String, event: TimeIntervalEntity) = EntryRevisionEntity(
        revisionId = revisionId,
        entryId = event.entryId,
        baseRevisionId = null,
        changedByDeviceId = "test-device",
        sourceDeviceId = event.sourceDeviceId,
        updatedAt = event.updatedAt,
        entryType = event.entryType,
        activityId = event.activityId,
        categoryId = event.categoryId,
        startedAt = event.startedAt,
        endedAt = requireNotNull(event.endedAt),
        timeZoneId = event.timeZoneId,
        timeZoneOffsetMinutes = event.timeZoneOffsetMinutes,
        confirmationState = event.confirmationState,
        deletedAt = null,
        acknowledged = false,
        createdAt = event.updatedAt,
        title = event.title,
    )
}
