package com.namehamal.tracker.data.local

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SessionRemovalPersistenceTest {
    private lateinit var database: TrackerDatabase
    private val databaseName = "session-removal-test.db"

    @Before fun createDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.deleteDatabase(databaseName)
        database = openDatabase(context)
    }

    @After fun closeDatabase() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        database.close()
        context.deleteDatabase(databaseName)
    }

    @Test fun singleRemovalDeletesLocalRevisionAndClearSyncedKeepsPendingAndRunningRows() = runBlocking {
        val repository = TimelineRepository(database, "test-device")
        val now = Instant.parse("2026-09-27T12:00:00Z")
        val removed = repository.createCompletedSession(
            "Remove me", "2026-09-27 08:00", "2026-09-27 09:00", "UTC", now,
        )
        val synced = repository.createCompletedSession(
            "Synced", "2026-09-27 09:00", "2026-09-27 10:00", "UTC", now,
        )
        val pending = repository.createCompletedSession(
            "Pending", "2026-09-27 10:00", "2026-09-27 11:00", "UTC", now,
        )
        val running = repository.startSession(
            "Running", "2026-09-27 11:30", "UTC", now,
        )
        val syncDao = database.syncDao()
        syncDao.insertRevision(revision("rev-remove", removed, acknowledged = true))
        syncDao.insertRevision(revision("rev-synced", synced, acknowledged = true))
        syncDao.insertRevision(revision("rev-pending", pending, acknowledged = false))
        database.workdayDao().markSynced(synced.entryId, "rev-synced", now.toEpochMilli())

        assertTrue(repository.removeSession(removed.entryId))
        assertNull(database.workdayDao().getInterval(removed.entryId))
        assertNull(syncDao.getLatestRevision(removed.entryId))
        assertNotNull(database.workdayDao().getRunningInterval())

        assertEquals(1, repository.clearSyncedSessions())
        assertNull(database.workdayDao().getInterval(synced.entryId))
        assertNull(syncDao.getLatestRevision(synced.entryId))
        assertNotNull(database.workdayDao().getInterval(pending.entryId))
        assertNotNull(database.workdayDao().getInterval(running.entryId))
        assertEquals(listOf("rev-pending"), syncDao.getPendingRevisions().map { it.revisionId })
        assertFalse(database.workdayDao().getSyncedEntryIds().contains(synced.entryId))
    }

    private fun revision(
        revisionId: String,
        event: TimeIntervalEntity,
        acknowledged: Boolean,
    ) = EntryRevisionEntity(
        revisionId = revisionId,
        entryId = event.entryId,
        baseRevisionId = null,
        changedByDeviceId = "test-device",
        sourceDeviceId = event.sourceDeviceId,
        updatedAt = event.updatedAt,
        entryType = event.entryType,
        activityId = event.activityId,
        categoryId = null,
        startedAt = event.startedAt,
        endedAt = requireNotNull(event.endedAt),
        timeZoneId = event.timeZoneId,
        timeZoneOffsetMinutes = event.timeZoneOffsetMinutes,
        confirmationState = event.confirmationState,
        deletedAt = null,
        acknowledged = acknowledged,
        createdAt = event.updatedAt,
        title = event.title,
    )

    private fun openDatabase(context: Context) = Room.databaseBuilder(
        context,
        TrackerDatabase::class.java,
        databaseName,
    ).addMigrations(*DatabaseMigrations.ALL).allowMainThreadQueries().build()
}
