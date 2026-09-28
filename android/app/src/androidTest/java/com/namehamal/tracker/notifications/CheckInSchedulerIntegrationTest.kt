package com.namehamal.tracker.notifications

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.data.local.TrackerDatabase
import com.namehamal.tracker.domain.WorkdayController
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CheckInSchedulerIntegrationTest {
    private lateinit var database: TrackerDatabase
    private lateinit var controller: WorkdayController
    private lateinit var scheduler: CheckInScheduler
    private lateinit var workManager: WorkManager

    @Before fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        workManager = WorkManager.getInstance(context)
        scheduler = CheckInScheduler(context)
        database = Room.inMemoryDatabaseBuilder(context, TrackerDatabase::class.java)
            .allowMainThreadQueries().build()
        controller = WorkdayController(TimelineRepository(database, "test-device"), scheduler)
    }

    @After fun tearDown() = database.close()

    @Test fun startSchedulesUniqueHourlyWorkAndEndCancelsIt() = runBlocking {
        controller.startWorkday(null)
        val workdayId = requireNotNull(database.workdayDao().getActiveWorkday()).workdayId
        val name = CheckInScheduler.uniqueWorkName(workdayId)
        val scheduled = workManager.getWorkInfosForUniqueWork(name).get()
        assertEquals(1, scheduled.size)
        assertTrue(scheduled.single().state == WorkInfo.State.ENQUEUED || scheduled.single().state == WorkInfo.State.RUNNING)

        controller.endWorkday()
        workManager.cancelUniqueWork(name).result.get()
        val cancelled = workManager.getWorkInfosForUniqueWork(name).get()
        assertTrue(cancelled.isNotEmpty())
        assertEquals(WorkInfo.State.CANCELLED, cancelled.single().state)
    }
}
