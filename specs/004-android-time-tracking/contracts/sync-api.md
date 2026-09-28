# Contract: Android → Mac Local Sync API

**Feature**: [Android Time Tracking Companion](../spec.md)  
**Protocol**: `1`  
**Transport**: Plain HTTP on a trusted private LAN only. There is no TLS, QR pairing, HMAC, or per-device authentication. This is an explicit accepted residual risk under Constitution v1.1.0: reachable LAN clients can observe or submit sync data.

The user enters and saves the Mac IP address and listening port once in Android; no QR step is required. The desktop bridge listens on its configured sync port (default `3061`) and forwards only the routes below to Next.js on loopback. The existing desktop UI/API remains on `127.0.0.1:3060`. The bridge rejects all other paths/methods; it does not serve UI assets or proxy arbitrary URLs. The Android app starts sync only after the user taps Sync; the desktop has no initiation control and no polling/background sync is allowed. The host cannot authenticate a caller, so reachability is controlled by the trusted-private-network boundary, not device credentials. Forgetting the saved endpoint stops this Android app from reusing it, but does not revoke host-side reachability or prevent another LAN client from connecting. Do not use this API on public or otherwise untrusted networks.

## Endpoint setup and forgetting

The user saves the Mac IP address and listening port in Android settings. No pairing endpoint, secret, QR code, or security credential is part of the contract. **Forget endpoint** clears the saved IP/port on Android; the user must enter them again to sync from that app. This is not server-side revocation and cannot block other clients that can reach the bridge.

## `GET /api/sync/v1/status`

On-demand readiness check. It returns no sessions, activity names, or other time data. Android calls it only as part of a user-started Sync flow; it must not poll in the background. The endpoint is unauthenticated and reachable to clients on the trusted LAN.

### `200 OK`

```json
{
  "protocolVersion": 1,
  "desktopDeviceId": "desktop-uuid",
  "syncEnabled": true
}
```

An absent/unreachable listener, invalid port, blocked LAN permission, or Mac firewall failure is shown as a retryable connection error. This check does not modify local or remote records.

## `POST /api/sync/v1/exchange`

The only endpoint that exchanges entries, activities, revisions, or conflicts. It has no authentication header. One invocation is part of a single user-started Android Sync flow. Requests and responses are JSON, `Cache-Control: no-store`, with bounded body size and request timeout. A multi-page exchange remains within that one user action; the client must not start another exchange after the user cancels. The logical scope is the full shared time-entry set and complete desktop activity list: the first sync (null cursor) downloads the complete available history, and later syncs incrementally exchange new/edited records and host changes without omitting older records from either device.

### Request

```json
{
  "protocolVersion": 1,
  "deviceId": "android-installation-uuid",
  "cursor": "opaque-cursor-or-null",
  "entryRevisions": [
    {
      "revisionId": "revision-uuid",
      "entryId": "entry-uuid",
      "baseRevisionId": "previous-revision-uuid-or-null",
      "sourceDeviceId": "origin-device-uuid",
      "changedByDeviceId": "android-installation-uuid",
      "updatedAt": "2026-09-26T08:00:00.000Z",
      "entry": {
        "entryType": "WORK",
        "activityId": "desktop-activity-id-or-null",
        "categoryId": "desktop-category-id-or-null",
        "startedAt": "2026-09-26T07:00:00.000Z",
        "endedAt": "2026-09-26T08:00:00.000Z",
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

`entryRevisions` contains locally persisted revisions not yet acknowledged by the host. `resolutions` contains new user decisions/undo records not yet acknowledged. `cursor` is an opaque server-issued change cursor, initially null. The client never sends a local wall-clock cursor.

### Successful response

```json
{
  "protocolVersion": 1,
  "desktopDeviceId": "desktop-uuid",
  "acceptedRevisionIds": ["revision-uuid"],
  "acceptedResolutionIds": [],
  "cursor": "opaque-next-cursor",
  "hasMore": false,
  "entryRevisions": [],
  "activities": [
    {
      "activityId": "desktop-activity-id",
      "title": "Planning",
      "categoryId": "desktop-category-id",
      "color": null,
      "sortOrder": 0,
      "isArchived": false
    }
  ],
  "conflicts": [],
  "resolutions": []
}
```

The host includes all revisions/conflict changes after `cursor` in stable server-sequence order and a complete current desktop Activity snapshot. If a bounded response has more pages, `hasMore` is true and the returned opaque cursor continues the same snapshot. The client continues automatically within the current manual action until `hasMore` is false, unless canceled. Activity snapshots may be repeated; Activity IDs make applying them idempotent.

## Transaction, identity, and conflict rules

1. Validate the protocol version, device ID, payload shape, interval values, IDs, and referenced Activity/Category data before applying changes.
2. Apply the complete incoming revision/resolution batch in one Prisma transaction. Reject the whole batch on structural/database failure; do not partially acknowledge it.
3. Treat a previously accepted `revisionId`/`resolutionId` as an idempotent retry. A repeated request returns its accepted IDs and current host delta without creating another Session or incrementing totals.
4. Persist each incoming version and its source metadata before projecting the current accepted state into desktop `Session` records. Preserve branches from a shared base as concurrent-edit conflicts; never use last-write-wins.
5. Use a host-owned monotonic change sequence for download ordering. `updatedAt` is audit metadata only. Return a response cursor only after the transaction succeeds.
6. Android commits all returned revisions, Activities, conflicts/resolutions, acknowledgements, and the new cursor in one Room transaction. If that local commit fails, it keeps the previous cursor and retries.
7. Same-Activity interval overlaps retain distinct source entries and count their shared minutes once. Different-Activity overlap conflicts remain visible; the intersecting span is excluded from activity totals while unresolved. User resolution creates new revisions and preserves original versions for undo.
8. A connection, validation, transaction, or local permission failure leaves Android's entries, unacknowledged revisions, conflicts, and cursor available for retry.

## Status and errors

| Status | Meaning | Client behavior |
|---|---|---|
| `200` | Status/exchange completed | Apply transactionally; show completion only after local commit. |
| `400` | Invalid JSON, field, timestamp, or interval | Show actionable protocol/data error; retain local changes. |
| `404` | Wrong host/port or endpoint not installed | Report unavailable endpoint; allow retry. |
| `409` | Unsupported protocol version or incompatible schema | Keep all local data and show update-required message; do not overwrite. |
| `413` | Request exceeds documented batch/body limit | Retry with smaller batches; retain unacknowledged revisions. |
| `503` | Bridge/host database temporarily unavailable | Report that sync did not complete; leave local data untouched. |

An ordinary overlap or competing edit is not an HTTP failure: it is durably accepted as a conflict and returned in `conflicts`. This API provides no client authentication or transport encryption. Its trusted-private-LAN-only restriction is an explicit accepted residual risk under Constitution v1.1.0, not a security guarantee: any reachable LAN client may read or submit sync data. The narrow route allowlist is defense-in-depth, not access control. The API provides no cloud relay, generic proxying, desktop-initiated sync, or automatic sync routes.
