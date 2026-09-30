package com.namehamal.tracker.notifications

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.namehamal.tracker.data.settings.ReminderSettings
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ReminderSchedulerIntegrationTest {
    private lateinit var workManager: WorkManager
    private lateinit var scheduler: ReminderScheduler

    private val fixedNow: ZonedDateTime =
        ZonedDateTime.of(LocalDate.of(2026, 9, 30), LocalTime.of(12, 0), ZoneId.of("UTC"))

    @Before fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        WorkManagerTestInitHelper.initializeTestWorkManager(context)
        workManager = WorkManager.getInstance(context)
        scheduler = ReminderScheduler(context) { fixedNow }
    }

    @After fun tearDown() {
        workManager.cancelAllWork().result.get()
    }

    @Test fun enablingSchedulesExactlyOneUniqueReminderCycle() {
        scheduler.scheduleNext(ReminderSettings(enabled = true))
        val infos = workManager.getWorkInfosForUniqueWork(ReminderScheduler.UNIQUE_WORK_NAME).get()
        assertEquals(1, infos.count { it.state == WorkInfo.State.ENQUEUED })
        assertTrue(infos.all { ReminderScheduler.TAG in it.tags })
    }

    @Test fun disablingCancelsPendingReminderAndSchedulesNothing() {
        scheduler.scheduleNext(ReminderSettings(enabled = true))
        scheduler.cancelAll()
        val infos = workManager.getWorkInfosForUniqueWork(ReminderScheduler.UNIQUE_WORK_NAME).get()
        assertTrue(infos.none { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING })
    }

    @Test fun disabledSettingsDoNotScheduleWork() {
        scheduler.scheduleNext(ReminderSettings(enabled = false))
        val infos = workManager.getWorkInfosForUniqueWork(ReminderScheduler.UNIQUE_WORK_NAME).get()
        assertTrue(infos.none { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING })
    }

    @Test fun changingCycleCancelsAndReenqueuesUniqueWork() {
        scheduler.scheduleNext(ReminderSettings(enabled = true, intervalMinutes = 60))
        scheduler.reschedule(ReminderSettings(enabled = true, intervalMinutes = 120))
        val infos = workManager.getWorkInfosForUniqueWork(ReminderScheduler.UNIQUE_WORK_NAME).get()
        assertEquals(1, infos.count { it.state == WorkInfo.State.ENQUEUED })
    }

    @Test fun changingWindowCancelsAndReenqueuesUniqueWork() {
        scheduler.scheduleNext(ReminderSettings(enabled = true))
        scheduler.reschedule(ReminderSettings(enabled = true, windowStartMinutes = 1320, windowEndMinutes = 360))
        val infos = workManager.getWorkInfosForUniqueWork(ReminderScheduler.UNIQUE_WORK_NAME).get()
        assertEquals(1, infos.count { it.state == WorkInfo.State.ENQUEUED })
    }

    @Test fun emptyWindowSchedulesNothing() {
        scheduler.scheduleNext(ReminderSettings(enabled = true, windowStartMinutes = 540, windowEndMinutes = 540))
        val infos = workManager.getWorkInfosForUniqueWork(ReminderScheduler.UNIQUE_WORK_NAME).get()
        assertTrue(infos.none { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING })
    }
}
