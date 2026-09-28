# Contract: Android Upload-Only Session Sync

**Feature**: [Simplified Android Tracking](../spec.md)  
**Routes**: Existing `/api/sync/v1/status` and `/api/sync/v1/exchange` through the current sync-only desktop bridge.  
**Transport**: Plain HTTP on a trusted private LAN only. Android calls these routes only after the user explicitly chooses Sync. The ordinary desktop listener remains loopback-only; no cloud, background sync, or desktop-initiated sync is added.

This is an additive capability of the existing v1 protocol. A legacy client that omits `mode` retains its current bidirectional exchange behavior. The simplified Android app requires the host to advertise both `entry-title` and `upload-only`; it must not fall back to a response that downloads desktop events. A host without those capabilities returns an actionable update-required message before Android sends event data.

## Endpoint configuration

- Android settings save a host (IP literal or hostname) and whole-number port `1..65535`; saving does not require the desktop to be reachable.
- At connection time, a hostname must resolve only to private/loopback/link-local destinations. Sync is for trusted private networks only.
- An invalid host or port must not replace a previously saved valid endpoint. Failure to resolve/reach the host leaves Room events unchanged.

## `GET /api/sync/v1/status`

Called only within a user-started sync action. It returns readiness and capability metadata, not entries or activity names.

### `200 OK`

```json
{
  "protocolVersion": 1,
  "desktopDeviceId": "desktop-uuid",
  "syncEnabled": true,
  "capabilities": ["entry-title", "upload-only"]
}
```

If either required capability is absent, the new Android client stops before upload and asks the user to update the desktop host. A network/status failure does not change local tracking data.

## `POST /api/sync/v1/exchange`

One request or bounded page in one manual Sync action. `mode: "UPLOAD_ONLY"` opts the simplified Android client into the new behavior. The server continues to validate and durably apply submitted revisions using existing stable revision/entry IDs, but returns acknowledgements only; it does not return host revisions, activities, conflicts, or resolutions to this client.

### Request

```json
{
  "protocolVersion": 1,
  "mode": "UPLOAD_ONLY",
  "deviceId": "android-installation-uuid",
  "cursor": null,
  "entryRevisions": [
    {
      "revisionId": "revision-uuid",
      "entryId": "event-uuid",
      "baseRevisionId": null,
      "sourceDeviceId": "android-installation-uuid",
      "changedByDeviceId": "android-installation-uuid",
      "updatedAt": "2026-09-27T08:00:00.000Z",
      "entry": {
        "entryType": "WORK",
        "title": "Planning",
        "activityId": null,
        "categoryId": null,
        "startedAt": "2026-09-27T07:00:00.000Z",
        "endedAt": "2026-09-27T08:00:00.000Z",
        "timeZoneId": "Asia/Yerevan",
        "timeZoneOffsetMinutes": 240,
        "confirmationState": "CONFIRMED",
        "deletedAt": null
      }
    }
  ],
  "resolutions": []
}
```

Rules:

1. Only completed events (`endedAt` set and after `startedAt`) may be uploaded. Running events remain local until stopped.
2. `title` is required and nonblank in upload-only mode. The host persists it as the existing desktop `Session.title`; with no Activity ID it uses the existing Unassigned category fallback.
3. The client persists a stable `entryId` and `revisionId` before sending. A retry reuses them.
4. Android remove/clear operations never create a request, revision, tombstone, or `deletedAt` change. `deletedAt` is always null for new events.
5. Device-local timestamps are serialized as ISO-8601 instants, with IANA zone and offset retained as metadata.

### Successful response

```json
{
  "protocolVersion": 1,
  "mode": "UPLOAD_ONLY",
  "desktopDeviceId": "desktop-uuid",
  "acceptedRevisionIds": ["revision-uuid"],
  "acceptedResolutionIds": [],
  "cursor": null,
  "hasMore": false,
  "entryRevisions": [],
  "activities": [],
  "conflicts": [],
  "resolutions": []
}
```

Android marks only events whose submitted revision IDs appear in `acceptedRevisionIds` as synced, and only after the response plus local Room update commits. A successful host transaction followed by a lost response is safe: the next request repeats the same revision ID and the host returns its prior acknowledgement without creating a duplicate Session.

## Removal and cleanup semantics

- Removing one Android event or clearing acknowledged events is a local Room operation only.
- The desktop Session and immutable accepted revision remain on the desktop.
- The upload-only response contains no downloaded timeline rows, so a locally cleared event is not re-imported into Android.
- Pending/unacknowledged events remain local and retryable. A failed or interrupted batch never marks unaccepted events as synced.

## Errors and retry behavior

| Condition | Android behavior |
|---|---|
| Host unavailable, DNS failure, blocked LAN permission, or timeout | Show a retryable connection error; do not mark events synced or remove them. |
| Missing `entry-title` / `upload-only` capability | Stop before upload; explain that the desktop host must be updated. |
| Invalid event or unsupported protocol | Keep all unacknowledged local events; show an actionable error. |
| Host transaction succeeds but response is lost | Retry with the same entry and revision IDs; host idempotence prevents duplicates. |
| Partial/page response | Mark only the returned accepted revision IDs; leave other events pending. |

The bridge remains restricted to the existing sync route allowlist. This contract adds no generic proxy routes, event deletion route, TLS mode, or authentication scheme.
