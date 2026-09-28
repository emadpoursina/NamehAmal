# Feature Specification: Activity Management Fixes

**Feature Branch**: `activity-management-fixes`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: Fix the Android activity-management experience: position the Settings back button below the app header without changing the main-page layout; add date and time pickers; let users select individual or all activities and clear all; add categories and carry the category when restarting an activity; expose saved desktop Activities in Android while retaining custom titles.

## Clarifications

### Session 2026-09-27

- Q: Should assigning a category be optional, or must every new Android activity have a category? → A: Every new Android activity must have a category.
- Q: Should Android offer saved desktop Activities as well as custom titles? → A: Yes. Explicit Sync loads desktop Activity presets; selecting one fills its title/category, while custom titles remain supported. Keep Start again on logged records and remove the duplicate separate Start again list.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enter Activity Times with Pickers (Priority: P1)

As a person recording time on Android, I want to choose activity dates and times using pickers, so that I can create or start an activity without typing date and time values.

**Why this priority**: Direct date and time selection makes the core tracking flow quicker and less error-prone, especially for manually entered past activities.

**Independent Test**: Create a completed activity using only the date and time pickers for its start and end, then verify its saved date-times; repeat with a running activity's start date-time.

**Acceptance Scenarios**:

1. **Given** the user is entering a completed activity, **When** they choose start and end dates and times and save, **Then** the activity is saved with the chosen values without requiring keyboard entry for dates or times.
2. **Given** the user is starting a running activity, **When** they choose its start date and time and start it, **Then** the activity uses the selected date-time, subject to existing validation rules.
3. **Given** a date or time picker is open, **When** the user cancels it, **Then** the previously selected value remains unchanged.
4. **Given** the user chooses a past date and a valid start/end range, **When** they save the completed activity, **Then** it is saved in the user's local time zone.

---

### User Story 2 - Categorize and Restart Activities (Priority: P1)

As a person who tracks recurring kinds of work, I want to choose a saved desktop Activity or enter a custom title, assign a category, and carry the saved Activity/category into a restarted activity, so that repeated records remain consistently organized.

**Why this priority**: Categories are part of the desktop tracking experience and are needed to keep Android-created and restarted activities organized in the same way.

**Independent Test**: Create or choose an activity with a category, restart it, and verify the new record has the same category while the earlier record remains unchanged.

**Acceptance Scenarios**:

1. **Given** the user is creating or starting an activity, **When** they choose one of the available desktop categories, **Then** the saved activity record is associated with that category.
2. **Given** a saved activity has a category, **When** the user chooses to start it again, **Then** the category is preselected for the new activity and the prior record is unchanged.
3. **Given** the user changes the category for a new activity, **When** they save or start it, **Then** the new record uses the chosen category without changing the category on earlier records.
4. **Given** a prior activity's category is no longer available, **When** the user restarts it, **Then** the user can choose an available category before saving or starting the new record.
5. **Given** the user has not selected a category, **When** they try to save or start a new activity, **Then** the activity is not saved or started until they select an available category.
6. **Given** saved desktop Activities have been loaded by Sync, **When** the user chooses one, **Then** its title and category are filled in and its desktop Activity ID is retained on the new record.
7. **Given** the user types a custom title or edits a saved Activity's title, **When** they save or start it, **Then** it is recorded as a custom session without a desktop Activity ID and remains available in recent titles.
8. **Given** the user views logged activities, **When** they want to restart one, **Then** Start again is available on that record and no duplicate separate Start again list is shown.

---

### User Story 3 - Select and Clear Activity Records (Priority: P2)

As a person maintaining my Android activity list, I want to select one or more records, select all records, or clear all records, so that I can remove unwanted local history efficiently.

**Why this priority**: Bulk selection and clearing reduce repetitive work while retaining a clear confirmation step for destructive actions.

**Independent Test**: Select a subset of records and remove it, then clear all remaining records; verify that cancellations preserve records and confirmed Android removals do not delete desktop copies.

**Acceptance Scenarios**:

1. **Given** the activity list contains multiple records, **When** the user selects individual records and confirms removal of the selection, **Then** only the selected records are removed from Android.
2. **Given** the activity list contains records, **When** the user chooses Select all, **Then** every record in the list is selected and can be removed as one confirmed action.
3. **Given** the activity list contains records, **When** the user chooses Clear all and confirms, **Then** all Android-local activity records are removed, not only currently selected records.
4. **Given** the user cancels a selected-record removal or Clear all confirmation, **When** the activity list is shown again, **Then** all records remain unchanged.
5. **Given** a selected record or all records include a running activity, **When** the user confirms removal, **Then** that activity is stopped and removed; canceling leaves it running.

---

### User Story 4 - Navigate Back from Settings (Priority: P2)

As a person using Android settings, I want the back control to appear below the app header and remain usable, so that I can return without a control being hidden behind the header.

**Why this priority**: The current Settings back control is difficult to reach, while the main page layout already works and should remain stable.

**Independent Test**: Open Settings on a supported screen size and verify that the back control is fully visible and usable below the app header, then verify that the main page layout is unchanged.

**Acceptance Scenarios**:

1. **Given** the user opens Settings, **When** the page is displayed, **Then** the back control appears below the app header without being overlapped and returns to the prior screen when activated.
2. **Given** the user opens the main tracking page, **When** it is displayed after this change, **Then** its existing header and content positioning remain unchanged.

### Edge Cases

- Canceling or dismissing a date/time picker leaves the previously selected value intact.
- The selected end date-time is equal to or earlier than the start date-time; existing validation rejects the invalid completed activity and leaves the list unchanged.
- A date-time picker is used to enter an activity from a past date; past-date support remains available.
- The activity list is empty; Select all and Clear all do not create or alter records.
- The user selects only some records and then chooses Clear all; the explicit Clear all action still targets every local record.
- Bulk removal includes a running activity; it stops only after the user confirms removal.
- Selected or cleared records were previously synced; Android removal never deletes the desktop copy or propagates a deletion.
- A new activity cannot be saved or started until an available category is selected.
- A saved activity's category is unavailable; the user can choose an available category for the new record, without changing the old record.
- The Settings page is opened at different supported screen sizes; its back control remains visible below the app header.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Android Settings page MUST place its back control below the app header so that it is fully visible, unobscured, and usable.
- **FR-002**: The Android main tracking page MUST retain its current header and content positioning.
- **FR-003**: The Android activity-entry flow MUST provide date and time pickers for the date-time values needed to enter a completed activity and start a running activity; users MUST be able to enter those values without typing them.
- **FR-004**: Canceling a date or time picker MUST leave the corresponding previously selected value unchanged.
- **FR-005**: Picker-selected values MUST follow the user's device-local time zone and preserve existing support for past manual activity dates and validation of invalid time ranges.
- **FR-006**: The Android activity-entry flow MUST require users to select a category from the categories available in the existing desktop tracking experience before saving or starting each new activity; an activity MUST NOT be saved or started without a selected category.
- **FR-007**: The category associated with an activity MUST be retained and available when that activity is restarted; restarting MUST preselect that category for the new record.
- **FR-008**: Changing a category for a new record MUST NOT change category assignments on earlier records.
- **FR-009**: The Android activity list MUST let users select individual activity records and MUST provide Select all and clear-selection actions covering the full list.
- **FR-010**: The Android activity list MUST provide an action to remove selected records and a distinct Clear all action that removes every Android-local activity record.
- **FR-011**: Selected-record removal and Clear all MUST require confirmation; canceling MUST leave all records unchanged. If confirmed removal includes a running activity, that activity MUST stop as part of removal.
- **FR-012**: Removing selected or all records MUST affect Android-local records only and MUST NOT delete desktop records or send a deletion to the desktop.
- **FR-013**: Clearing Android activity records MUST leave saved connection settings and available category data unchanged.
- **FR-014**: During explicit Sync, Android MUST refresh desktop Activity preset metadata through the existing sync status route alongside categories; it MUST NOT download desktop sessions or timeline data.
- **FR-015**: Android MUST let the user choose an available saved Activity to prefill its title/category and retain its Activity ID, while still allowing custom free-text titles with no Activity ID.
- **FR-016**: Custom session titles MUST remain available as recent title choices after being saved or started.
- **FR-017**: The Android screen MUST provide Start again on logged activity records without a separate duplicate Start again list.

### Key Entities *(include if feature involves data)*

- **Activity Record**: A tracked item with its title, required category, start date-time, and end date-time when completed; an in-progress item has no end date-time until stopped.
- **Category**: An existing desktop category that MUST be assigned to every Android-created or restarted activity.
- **Saved Activity**: A reusable desktop preset with a title and category, cached on Android during explicit Sync and selected without downloading desktop time entries.
- **Selection**: The set of activity records currently selected for a bulk removal action; Clear all targets the full Android-local activity list independently of this set.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of date/time-entry checks, users can create a completed activity and start a running activity using pickers without typing date or time values.
- **SC-002**: In 100% of supported-screen checks, the Settings back control is fully visible and usable below the app header, and the main-page layout is unchanged.
- **SC-003**: In 100% of create/start checks, no activity is saved or started without a selected available category; in 100% of restart checks, the new activity receives the saved activity's category unless the user chooses a different available category, and prior records remain unchanged.
- **SC-004**: In 100% of bulk-removal checks, removing a selection affects only selected records, Clear all affects every local record, and canceling preserves the data.
- **SC-005**: In 100% of tests involving previously synced records, Android selected-record removal and Clear all leave corresponding desktop records unchanged.
- **SC-006**: At least 90% of users in a usability test can complete manual activity date/time entry on their first attempt without assistance.
- **SC-007**: At least 85% of usability-test participants rate picker-based activity entry as easy or very easy on a five-point scale.

## Assumptions

- This feature applies only to the Android companion; desktop tracking and its current main-page layout are not changed.
- “Activities” in selection and Clear all refer to recorded activity/session entries in the Android list, not reusable desktop Activity presets, category definitions, or saved connection settings.
- Select all selects the complete activity list, and removal of that selection is separate from Clear all, which always removes every Android-local activity record after confirmation.
- Android-local removals are not propagated to the desktop; synced desktop copies remain intact. If a running record is included in a confirmed bulk removal, it is stopped and removed.
- Category choices and saved Activity presets come from the user's existing desktop data through explicit Sync; Android does not create or edit desktop categories/presets. A custom title creates a session record, not a desktop Activity preset. A restarted record uses the category and still-available preset ID of the saved record by default, while a user-selected category applies only to the new record.
- Date and time picker values use device-local time, as in the existing Android tracker. Activity titles remain editable text; saved presets and recent titles are optional choices.
