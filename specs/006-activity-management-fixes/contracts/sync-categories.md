# Contract: Android Category/Activity Metadata and Category-Bearing Sessions

**Feature**: [Activity Management Fixes](../spec.md)
**Routes**: Existing `/api/sync/v1/status` and `/api/sync/v1/exchange` through the existing sync-only desktop bridge.
**Transport**: Explicit user-initiated plain HTTP on a trusted private network only. The ordinary desktop API remains loopback-only; this feature adds no route, listener, background sync, cloud service, or desktop-initiated transfer.

This contract is an additive extension of the existing upload-only v1 protocol in [005's sync contract](../../005-simple-android-tracking/contracts/sync-api.md). New Android clients continue to upload completed event revisions and receive acknowledgements only. The status response adds desktop category and reusable Activity preset metadata, not sessions or timeline rows.

## `GET /api/sync/v1/status`

Called only during a user-started Sync action. The new Android client requires `entry-title`, `upload-only`, `category-metadata`, and `activity-metadata` before it can refresh metadata or upload sessions. Previously cached metadata remains available for offline local entry.

### `200 OK`

```json
{
  "protocolVersion": 1,
  "desktopDeviceId": "desktop-uuid",
  "syncEnabled": true,
  "capabilities": ["entry-title", "upload-only", "category-metadata", "activity-metadata"],
  "categories": [
    {
      "categoryId": "category-uuid",
      "name": "Client work",
      "sortOrder": 10,
      "isArchived": false
    }
  ],
  "activities": [
    {
      "activityId": "activity-uuid",
      "title": "Planning",
      "categoryId": "category-uuid",
      "color": "#22c55e",
      "sortOrder": 10,
      "isArchived": false
    }
  ]
}
```

Rules:

1. `categories` and `activities` contain only desktop-owned metadata; neither contains session/event rows or timeline history. Activity metadata is limited to ID, title, category ID, color, order, and archive state.
2. IDs are stable desktop IDs. Android presents active categories and saved activities whose category is active. Selecting a saved Activity pre-fills its title/category; a custom title remains free text and has a null `activityId`.
3. Android atomically caches both valid metadata lists from this route. If any required capability is absent or either list is malformed, it does not upload event data or erase the existing metadata/session cache.
4. Sync fetches status even when there are no pending completed sessions, so the user can refresh saved activities and categories without first creating an event.
5. The desktop may expose this metadata over the sync-only private-network route; Android MUST NOT fetch `/api/categories`, `/api/activities`, or another ordinary desktop API over the LAN.

If the host does not advertise either metadata capability, Android stops before sending event data and asks the user to update the desktop app. A fresh install with no cached categories cannot create a session until it loads an available category; a prior cache is preserved and remains usable offline. Android never silently assigns Unassigned to a new session.

## `POST /api/sync/v1/exchange` (`mode: "UPLOAD_ONLY"`)

The request envelope and acknowledgement behavior stay as specified by the existing upload-only contract. Each new Android session revision includes the selected category ID in `entry.categoryId`. Selecting a synced Activity also includes its `activityId`; custom titles use `null`:

```json
{
  "entry": {
    "entryType": "WORK",
    "title": "Planning",
    "activityId": "activity-uuid",
    "categoryId": "category-uuid",
    "startedAt": "2026-09-27T07:00:00.000Z",
    "endedAt": "2026-09-27T08:00:00.000Z",
    "timeZoneId": "Asia/Yerevan",
    "timeZoneOffsetMinutes": 240,
    "confirmationState": "CONFIRMED",
    "deletedAt": null
  }
}
```

Rules:

1. The new Android client MUST send a nonempty category ID for every newly created/restarted session revision. If a saved Activity is selected, its ID is also stored on the local event and revision; custom titles retain a null Activity ID. IDs are stable across retries.
2. The host persists the submitted category association on the desktop Session. An unknown/invalid category is rejected without acknowledging the revision; Android keeps the event local and reports a retry/actionable category error.
3. Existing legacy revisions with a null category remain readable and retain the existing compatibility behavior. The non-null requirement is enforced for new Android session creation; migration does not fabricate categories for old records.
4. The success response remains acknowledgement-only: `entryRevisions`, `activities`, `conflicts`, and `resolutions` are empty. Category and Activity metadata are returned only by the status request.
5. Removing selected or all Android records never creates a revision, tombstone, request, or `deletedAt` value. The desktop copy is never deleted by Android cleanup.

## Compatibility and failure behavior

| Condition | Android behavior |
|---|---|
| Missing either metadata capability or incompatible protocol | Do not upload; preserve local data/cache and show an update-required message. |
| Empty active category list or no selected category | Disable/reject new save/start and ask the user to sync/select a category. |
| Status network or validation failure | Preserve previous category/activity caches, events, endpoint settings, and pending revisions. |
| Category ID rejected at exchange | Do not mark the event synced; retain the local event/revision for recovery. |
| Lost upload response | Retry the same entry/revision/category IDs; host acknowledgement remains idempotent. |
| Android selected removal or Clear all | Delete target rows/revisions locally only; do not request desktop deletion. |
