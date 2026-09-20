# Contract: Renderer ↔ Main IPC (preload contextBridge)

**Branch**: `002-mac-menubar-pomodoro` | **Date**: 2026-09-20

The Electron main process is the single authority for desktop pomodoro state (research D1/D6).
The renderer accesses it **only** through `window.namehAmalDesktop`, installed by
`electron/preload.ts` via `contextBridge`. Preload uses only `contextBridge` and `ipcRenderer`
(both available under `sandbox: true`; existing window security settings unchanged:
`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).

Channel name constants live in `electron/ipc-channels.ts` and are imported by main and preload.

---

## Detection

```ts
interface NamehAmalDesktop { ... }        // full API below
declare global { interface Window { namehAmalDesktop?: NamehAmalDesktop } }
```

- `window.namehAmalDesktop !== undefined` → desktop build → renderer pomodoro uses the IPC
  transport (`app/lib/pomodoro/desktop-transport.ts`).
- `undefined` → web/browser → existing localStorage transport, unchanged.

## `invoke` channels (renderer → main, request/response)

### `pomodoro:get-state`
- **Payload**: `null`
- **Returns**: `PomodoroSnapshot`
  ```ts
  type PomodoroSnapshot = {
    state: PomodoroState;              // hydrated (tick-reconciled) at send time
    selectedActivity: SelectedActivityRef | null;
    reminderEnabled: boolean;
  };
  ```
- **Errors**: none expected; rejects only if the main process is shutting down.

### `pomodoro:start`
- **Payload**: `null`
- **Returns**: `PomodoroState` (post-action)
- Semantics: engine `start()` — starts focus from idle, or **resumes** a non-idle
  non-running phase (D4). If idle-start and no tracker draft is active and a selected activity
  exists, also starts the tracker via `POST /api/tracker` (bound session, D3).

### `pomodoro:stop`
- **Payload**: `null`
- **Returns**: `PomodoroState` (idle)
- Semantics: engine `stop()`; additionally stops (finalizes) the *bound* tracker draft if one
  exists. Independent tracker sessions are untouched (D3).

### `pomodoro:skip`
- **Payload**: `null`
- **Returns**: `PomodoroState`
- Semantics: engine `skip()` (advances to the next phase without recording).

### `pomodoro:update-settings`
- **Payload**: `Partial<PomodoroSettings>`
- **Returns**: `PomodoroState`
- Semantics: existing `updateSettings` (applies next phase when idle; merged while running).

### `desktop:report-selected-activity`
- **Payload**: `{ categoryId: string; title: string | null }`
- **Returns**: `void`
- Semantics: main validates (`categoryId` non-empty string after trim; invalid → ignore
  silently) and persists as `SelectedActivityRef` (data-model §3).

### `desktop:set-reminder-enabled`
- **Payload**: `boolean`
- **Returns**: `boolean` (persisted value)
- Semantics: persists `reminderEnabled` (FR-014). When turning on mid-idle, the reminder cycle
  re-arms from now (first reminder 5 minutes later).

## Event channels (main → renderer, push)

### `pomodoro:state-changed`
- **Payload**: `PomodoroSnapshot` (same shape as `pomodoro:get-state` return)
- Cadence: at most 1 Hz while running (only to existing, non-destroyed windows); immediate on
  any action-originated change; also sent once after a window finishes loading (renderer
  re-sync). The identical state object drives the Tray — FR-009 zero-divergence guarantee.

### `desktop:reminder-changed`
- **Payload**: `boolean` (new `reminderEnabled`)
- Sent when the toggle changes from the tray menu so the renderer can reflect it if/when a
  settings UI mirrors it.

## Error & lifecycle rules

- Main validates every payload shape; malformed payloads are answered with a rejected invoke
  and **no state change**.
- Tray-originated actions go through the exact same state functions — no separate code path.
- On app quit, all listeners are torn down; invokes reject after `before-quit` shutdown starts.
- The renderer must not assume ordering between `invoke` returns and `state-changed` events;
  the last received snapshot wins (monotonic by wall-clock tick).

## Non-goals

- No Prisma, no DB, no secrets over IPC.
- No activity picker/submenu anywhere in this API (FR-006: display-only activity).
- No window-to-window direct messaging; all state flows through main.
