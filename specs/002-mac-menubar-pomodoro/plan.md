# Implementation Plan: macOS Menu Bar Pomodoro

**Branch**: `002-mac-menubar-pomodoro` | **Date**: 2026-09-20 | **Spec**: specs/002-mac-menubar-pomodoro/spec.md

**Input**: Feature specification from `specs/002-mac-menubar-pomodoro/spec.md`

## Summary

Surface the existing pomodoro countdown and tracker lifecycle in the macOS menu bar via an
Electron `Tray` item. The pomodoro engine (`app/lib/pomodoro/engine.ts`, pure TypeScript, zero
DOM dependencies) is re-hosted in the Electron main process so the countdown, the 5-minute idle
reminder check, and the tray display keep running after the main window is closed (Dock icon
hidden, app stays alive). The renderer becomes a subscriber over a sandbox-safe IPC preload
bridge, keeping the in-app display and the menu bar consistent. The menu bar shows `MM:SS`
remaining plus the name of the activity being recorded (the active tracker draft), offers
Start/Resume + Stop + an idle-reminder on/off toggle, plus "Open App" and "Quit App". Reminders
are macOS system notification banners via Electron's `Notification`. No Prisma schema changes
and no new HTTP endpoints — menu-bar timer control reuses the existing `POST /api/tracker`
start/stop lifecycle (finalize on stop).

## Technical Context

**Language/Version**: TypeScript 6.0.3 (Electron main: `tsconfig.electron.json` → `.electron-dist/main.js`; renderer: Next.js 16.3.5 App Router, React 19)

**Primary Dependencies**: Electron 44.3.0 (`Tray`, `Menu`, `nativeImage`, `Notification`, `ipcMain`, `contextBridge`); existing Next.js route handlers (`/api/tracker`, `/api/settings`); Tailwind 4 (unchanged renderer UI)

**Storage**: SQLite via Prisma 7.8 (existing `ActiveTimer` draft + finalized `Session` — **unchanged**); new desktop-only runtime state persisted as JSON in Electron `userData` (`pomodoro.json`: settings, run snapshot, last selected activity, reminder preference)

**Testing**: Vitest (`bunx vitest run` / `npm test`); pure-function unit tests for new main-process logic (reminder scheduler, tray label/menu model, persistence parsing) following the existing `tests/electron/*` pattern; no mocks of Prisma (no new data-layer code)

**Target Platform**: macOS desktop build (Electron); non-macOS desktop and web/browser deployments keep today's behavior

**Project Type**: Desktop app (Electron shell over the existing single-process Next.js monolith)

**Performance Goals**: Tray title updates at most 1 Hz (only when the formatted label changes); reminder check every 5 minutes; no measurable impact on the Next.js server

**Constraints**: No new npm dependencies; no renderer Prisma; countdown, idle check, and tracking continue with the main window closed; closing the window must never finalize or discard an in-progress timer; notifications must be non-blocking banners, never modal dialogs

**Scale/Scope**: Single user, one window, one tray item, one reminder timer; ~5 new Electron main modules + 1 preload + a transport adapter in the renderer pomodoro hook

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Local-First Single-User Monolith | Feature touches only the existing Electron shell (already part of the desktop architecture) and the local Next.js server. No remote services, caches, or multi-user machinery. | ✅ Pass |
| II. Server-Owned Data Access | No Prisma in the renderer (existing rule preserved). Menu-bar timer start/stop calls the existing `/api/tracker` route handler over local HTTP from the main process — the same path client components already use. No new data-access layer. | ✅ Pass |
| III. Timezone-Aware Time Logic (NON-NEGOTIABLE) | No new session time logic. Menu-bar tracker start **omits** `timeZone` so the server normalizes to the configured default timezone (`getDefaultTimeZone`), and `timeZoneOffsetMinutes` is derived server-side as today. Pomodoro countdown is duration-based (`phaseEndsAtMs`), timezone-independent. | ✅ Pass |
| IV. Test-First with Real Dependencies | New main-process logic is extracted into pure, testable functions (reminder scheduling decision, tray label formatting/truncation, persisted-state parsing) and covered with Vitest unit tests; existing engine/format/storage tests keep passing. No DB-layer changes → no new data-layer tests required. | ✅ Pass |
| V. Simplicity & Framework Trust | Uses Electron built-ins only (`Tray`, `Menu`, `Notification`, `contextBridge`) — no wrappers, no speculative features. Every new module traces to an FR. Web/browser path keeps the existing localStorage implementation untouched. | ✅ Pass |

**Post-Phase 1 re-check**: Design introduces no schema changes, no endpoints, no new dependencies;
state ownership moves from renderer-only localStorage to the Electron main process *for the
desktop build only* — this is the existing shell boundary (analogous to "server-owned state"),
documented in `research.md` D6. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/002-mac-menubar-pomodoro/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── ipc.md           # Renderer ↔ main IPC (preload contextBridge) contract
│   └── tray.md          # Tray item + dropdown menu user-facing contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
electron/                          # Electron main process (existing)
├── main.ts                        # MODIFIED: window-close → hide-to-tray (darwin), app.dock.hide(), tray wiring, quit path
├── tray.ts                        # NEW: Tray creation, icon/title rendering, context menu model
├── pomodoro-host.ts               # NEW: main-process pomodoro engine host (reuses app/lib/pomodoro engine), 1 Hz tick
├── reminder-cycle.ts              # NEW: 5-minute idle check + macOS Notification delivery (pure decision fn + thin shell)
├── desktop-state.ts               # NEW: persisted runtime state (userData/pomodoro.json): settings, run snapshot, selected activity, reminder pref
├── ipc-channels.ts                # NEW: channel name constants + payload types shared by main and preload
├── preload.ts                     # NEW: contextBridge API (sandbox-compatible: ipcRenderer + contextBridge only)
└── (existing: runtime-config.ts, server-process.ts)

app/lib/pomodoro/                  # Renderer pomodoro (existing)
├── use-pomodoro.ts                # MODIFIED: selects transport — desktop IPC adapter vs localStorage (unchanged web path)
├── desktop-transport.ts           # NEW: renderer-side adapter over window.namehAmalDesktop (preload bridge)
└── (engine.ts, types.ts, format.ts, engine.test.ts, … reused as-is by main process)

tests/
├── electron/                      # Existing pattern: pure-function unit tests for main-process modules
│   ├── pomodoro-host.test.ts      # NEW: state persistence, tick/broadcast, resume/stop semantics
│   ├── reminder-cycle.test.ts     # NEW: fires only when idle & enabled, repeats every 5 min, resets on start
│   ├── tray.test.ts               # NEW: label formatting (MM:SS), activity-name truncation/fallback, menu model per state
│   └── desktop-state.test.ts      # NEW: parse/validate persisted JSON, corrupt-file fallback
└── (existing suites unchanged)
```

**Structure Decision**: Extend the existing `electron/` main-process directory and the existing
`app/lib/pomodoro/` renderer library. No new top-level projects; single repo, single app. The
pomodoro engine module is shared verbatim between renderer (web) and main (desktop) because it
is pure TypeScript with no DOM/browser dependencies (verified: `engine.ts`, `types.ts`,
`format.ts` import nothing platform-specific).

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
