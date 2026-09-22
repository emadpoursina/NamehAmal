# Implementation Plan: Sync Pomodoro Timers

**Branch**: `003-sync-pomodoro-timers` | **Date**: 2026-09-22 | **Spec**: specs/003-sync-pomodoro-timers/spec.md

**Input**: Feature specification from `specs/003-sync-pomodoro-timers/spec.md`

## Summary

Guarantee one authoritative pomodoro clock shared by the macOS menu bar and the in-app
pomodoro page. The Electron main-process host (`electron/pomodoro-host.ts`) already owns the
desktop clock and broadcasts snapshots over IPC (feature 002); this feature hardens and
completes the sync contract rather than building a second engine:

- The desktop pomodoro page becomes an explicit *view/controller* of the host clock. It
  renders an idle/placeholder "waiting for desktop host" state until the first host snapshot
  arrives (`pomodoro:get-state` may return `null` while the host hydrates) and **never**
  falls back to a local engine or the browser-local store in desktop mode (FR-009).
- The activity label (`PomodoroSnapshot.selectedActivity` → resolved draft title) is surfaced
  next to the in-app countdown so both surfaces show the same label (FR-012).
- Eventual sync semantics are documented and enforced: transitions broadcast immediately,
  per-second mirroring is already a superset of the required eventual convergence; a full
  re-sync happens on `did-finish-load` (refresh/revisit). No new sync mechanism is invented.
- Settings-store independence is asserted by tests: desktop mode never touches
  `localStorage`; web mode never touches `userData/pomodoro.json`; the two stores are never
  merged (FR-004).

Web-only mode keeps its existing single standalone clock with `localStorage` persistence and
wall-clock hydration (unchanged).

## Technical Context

**Language/Version**: TypeScript 6.0.3 — Electron main (`tsconfig.electron.json` → `.electron-dist/main.js`) + Next.js 16.2.4 App Router / React 19 renderer

**Primary Dependencies**: Electron 44.3.0 (`ipcMain`, `contextBridge`, `Tray` — existing, unchanged); React 19 context (`PomodoroProvider`); Vitest (`npm test`)

**Storage**: No new storage. Desktop: existing `userData/pomodoro.json` via `DebouncedWriter` (`electron/desktop-state.ts`). Web: existing `localStorage` keys (`app/lib/pomodoro/storage.ts`). The two stores remain strictly independent (FR-004).

**Testing**: Vitest — new unit tests for the host-connection state machine and desktop/web store isolation (pure functions + `PomodoroProvider`-level helpers), plus the existing `tests/electron/*` and `app/lib/pomodoro/*.test.ts` suites kept green.

**Target Platform**: macOS desktop build (Electron) primarily; plain-browser mode must keep working identically (US3).

**Project Type**: Desktop app (Electron shell over the existing single-process Next.js monolith)

**Performance Goals**: unchanged — host broadcasts ≤1 Hz (`BROADCAST_MIN_INTERVAL_MS = 950`), tray repaint gated; renderer IPC fetch once on mount plus push subscription.

**Constraints**: No new npm dependencies; no new IPC channels; no renderer Prisma; the desktop page must never start a local countdown engine (FR-009); web-mode behavior must not regress (US3); settings changed mid-countdown apply from the next phase (FR-007, existing `updateSettings` semantics).

**Scale/Scope**: ~3 modified files (`PomodoroProvider.tsx`, `PomodoroView.tsx`, `desktop-transport.ts` or provider helpers) + new tests; no schema, endpoint, or dependency changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Local-First Single-User Monolith | Only the existing Electron shell boundary and renderer context change. One clock per app instance = one local host process. No remote services or multi-user machinery. | ✅ Pass |
| II. Server-Owned Data Access | No Prisma or data-layer changes. The main-process tracker integration (`/api/tracker` over local HTTP) is untouched. | ✅ Pass |
| III. Timezone-Aware Time Logic (NON-NEGOTIABLE) | No new session/time logic. Countdown stays duration-based (`phaseEndsAtMs`); tracker start/stop paths unchanged. | ✅ Pass |
| IV. Test-First with Real Dependencies | New logic is extracted into pure, Vitest-tested helpers (host-connection state machine, store-isolation guards); real dependencies (no DB changes, existing suites run). | ✅ Pass |
| V. Simplicity & Framework Trust | Reuses the existing engine, host, IPC contract, and React context; adds a small connection-state flag and one display field — no wrappers, no speculative features. | ✅ Pass |

**Post-Phase 1 re-check**: Design adds no schema, endpoints, or dependencies; all changes are
within the existing desktop-shell boundary and renderer context. The "waiting for host"
placeholder is required by FR-009 and traced to a concrete acceptance scenario. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/003-sync-pomodoro-timers/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (host-sync contract)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
electron/
├── pomodoro-host.ts     # Authoritative desktop clock (existing; hydrate/getSnapshot unchanged)
├── ipc-channels.ts      # Existing IPC contract — getPomodoroState may resolve null (host not ready)
└── main.ts              # Existing wiring: host → broadcast → windows + tray (unchanged)

app/
├── lib/pomodoro/
│   ├── PomodoroProvider.tsx   # MODIFY: host-connection state machine; never local engine in desktop mode; expose activity name
│   ├── desktop-transport.ts   # MODIFY (types only): snapshot/connection types shared with view
│   ├── desktop-connection.test.ts # NEW: connection-state + store-isolation unit tests
│   └── storage.ts             # Unchanged (web-local store)
└── pomodoro/
    └── PomodoroView.tsx       # MODIFY: placeholder while waiting for host; activity label next to countdown

tests/
└── electron/            # Existing host/tray tests keep passing
```

**Structure Decision**: Modify the existing renderer context and view in place; extend the
existing IPC snapshot semantics with an explicit "host not connected" (`null`) contract. No
new modules, directories, or processes.

## Complexity Tracking

No constitution violations — table intentionally empty.
