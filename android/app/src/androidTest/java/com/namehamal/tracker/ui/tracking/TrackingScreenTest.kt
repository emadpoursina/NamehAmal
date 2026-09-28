package com.namehamal.tracker.ui.tracking

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.room.Room
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.click
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withId
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.activity.ComponentActivity
import com.namehamal.tracker.TrackerApplication
import com.namehamal.tracker.data.local.ActivitySnapshotEntity
import com.namehamal.tracker.data.local.CategorySnapshotEntity
import com.namehamal.tracker.data.local.TimeIntervalEntity
import com.namehamal.tracker.data.local.TimelineRepository
import com.namehamal.tracker.data.local.TrackerDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TrackingScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    private lateinit var database: TrackerDatabase
    private lateinit var viewModel: TrackingViewModel
    private lateinit var trackingScope: CoroutineScope

    @Before
    fun seedActiveCategoryInTestDatabase() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        database = Room.inMemoryDatabaseBuilder(context, TrackerDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        database.categoryDao().upsert(
            CategorySnapshotEntity(
                categoryId = "category-general",
                name = "General",
                sortOrder = 10,
                isArchived = false,
                receivedAt = 1L,
            ),
        )
        trackingScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        viewModel = TrackingViewModel(
            repository = TimelineRepository(database, "picker-test-device"),
            coroutineScope = trackingScope,
        )
    }

    @After
    fun closeTestDatabase() {
        trackingScope.cancel()
        database.close()
    }

    @Test
    fun dateAndTimePickersOpenConfirmAndCancelWithoutMovingTrackingContent() {
        val syncViewModel = (composeRule.activity.application as TrackerApplication).syncSettingsViewModel()
        composeRule.setContent {
            MaterialTheme {
                TrackingScreen(viewModel, syncViewModel) {}
            }
        }
        composeRule.waitForIdle()
        val headerTopBefore = composeRule.onNodeWithText("NamehAmal tracking")
            .fetchSemanticsNode().boundsInRoot.top

        // The category comes from this test's in-memory Room fixture, never the desktop.
        composeRule.onNodeWithTag("activity-title").performTextInput("Picker test")
        composeRule.onNodeWithTag("category-picker").performClick()
        composeRule.onNodeWithText("General").assertExists()
        composeRule.onNodeWithText("General").performClick()

        val startDateBeforeCancel = textFor("start-date-picker")
        composeRule.onNodeWithTag("start-date-picker").performClick()
        onView(withId(android.R.id.button2)).check(matches(isDisplayed())).perform(click())
        assertEquals(startDateBeforeCancel, textFor("start-date-picker"))
        composeRule.onNodeWithTag("start-date-picker").performClick()
        onView(withId(android.R.id.button1)).check(matches(isDisplayed())).perform(click())

        val startTimeBeforeCancel = textFor("start-time-picker")
        composeRule.onNodeWithTag("start-time-picker").performClick()
        onView(withId(android.R.id.button2)).check(matches(isDisplayed())).perform(click())
        assertEquals(startTimeBeforeCancel, textFor("start-time-picker"))
        composeRule.onNodeWithTag("start-time-picker").performClick()
        onView(withId(android.R.id.button1)).check(matches(isDisplayed())).perform(click())

        val endDateBeforeCancel = textFor("end-date-picker")
        composeRule.onNodeWithTag("end-date-picker").performClick()
        onView(withId(android.R.id.button2)).check(matches(isDisplayed())).perform(click())
        assertEquals(endDateBeforeCancel, textFor("end-date-picker"))
        composeRule.onNodeWithTag("end-date-picker").performClick()
        onView(withId(android.R.id.button1)).check(matches(isDisplayed())).perform(click())

        val endTimeBeforeCancel = textFor("end-time-picker")
        composeRule.onNodeWithTag("end-time-picker").performClick()
        onView(withId(android.R.id.button2)).check(matches(isDisplayed())).perform(click())
        assertEquals(endTimeBeforeCancel, textFor("end-time-picker"))
        composeRule.onNodeWithTag("end-time-picker").performClick()
        onView(withId(android.R.id.button1)).check(matches(isDisplayed())).perform(click())

        composeRule.onNodeWithText("Save completed").performClick()
        composeRule.waitUntil(5_000) { viewModel.state.value.message == "Session saved." }
        val saved = runBlocking {
            database.workdayDao().getAllIntervals().first { it.title == "Picker test" && it.endedAt != null }
        }
        assertEquals("category-general", saved.categoryId)

        composeRule.onNodeWithText("Start").performClick()
        composeRule.waitUntil(5_000) { viewModel.state.value.message == "Session started." }
        val running = runBlocking {
            database.workdayDao().getAllIntervals().first { it.title == "Picker test" && it.endedAt == null }
        }
        assertEquals("category-general", running.categoryId)

        composeRule.waitForIdle()
        val headerTopAfter = composeRule.onNodeWithText("NamehAmal tracking")
            .fetchSemanticsNode().boundsInRoot.top
        assertEquals(headerTopBefore, headerTopAfter, 0.5f)
    }

    @Test
    fun savedDesktopActivityPrefillsSessionAndRestartStaysInLoggedActivity() {
        val source = TimeIntervalEntity(
            entryId = "previous",
            workdayId = null,
            entryType = "WORK",
            activityId = null,
            categoryId = "category-general",
            startedAt = 1_000L,
            endedAt = 2_000L,
            timeZoneId = "UTC",
            timeZoneOffsetMinutes = 0,
            confirmationState = "CONFIRMED",
            sourceDeviceId = "phone",
            updatedAt = 2_000L,
            title = "Previous custom session",
        )
        runBlocking {
            database.workdayDao().insertInterval(source)
            database.workdayDao().putActivity(
                ActivitySnapshotEntity(
                    activityId = "activity-client",
                    title = "Client work",
                    categoryId = "category-general",
                    color = "#22c55e",
                    sortOrder = 10,
                    isArchived = false,
                    snapshotVersion = "activity-client",
                    receivedAt = 1L,
                ),
            )
        }
        val syncViewModel = (composeRule.activity.application as TrackerApplication).syncSettingsViewModel()
        composeRule.setContent {
            MaterialTheme {
                TrackingScreen(viewModel, syncViewModel) {}
            }
        }
        composeRule.waitForIdle()

        composeRule.onNodeWithTag("saved-activity-picker").performClick()
        composeRule.onNodeWithTag("saved-activity-option-activity-client").performClick()
        assertEquals(
            "Client work",
            composeRule.onNodeWithTag("activity-title").fetchSemanticsNode()
                .config[SemanticsProperties.EditableText].text,
        )
        assertEquals("category-general", viewModel.state.value.selectedCategoryId)

        composeRule.onNodeWithText("Start").performClick()
        composeRule.waitUntil(5_000) { viewModel.state.value.message == "Session started." }
        val started = runBlocking {
            database.workdayDao().getAllIntervals().first {
                it.activityId == "activity-client" && it.endedAt == null
            }
        }
        assertEquals("Client work", started.title)
        assertEquals("category-general", started.categoryId)

        composeRule.onNodeWithTag("start-again-previous").assertExists()
        composeRule.onNodeWithText("Start again: Previous custom session").assertDoesNotExist()
    }

    private fun textFor(tag: String): String = composeRule.onNodeWithTag(tag)
        .fetchSemanticsNode()
        .config[SemanticsProperties.Text]
        .joinToString(separator = "") { it.text }
}
