# Contract: Tray Item & Dropdown Menu (macOS)

**Branch**: `002-mac-menubar-pomodoro` | **Date**: 2026-09-20

User-facing contract for the macOS menu bar item. Implemented in `electron/tray.ts`; state
comes exclusively from the main-process pomodoro host (single authority, FR-009).

---

## Item appearance

| State | Icon | Title text | FR |
|---|---|---|---|
| No pomodoro running | idle glyph `×` (template image) | *(empty title — no countdown)* | FR-007 |
| Pomodoro running | running glyph (template image) | `MM:SS` + space + activity name | FR-005, FR-006 |

- `MM:SS` from the existing `formatPomodoroCountdown(remainingSeconds)`; updates **every
  second** while running (clarified decision).
- **Activity name resolution** (display-only; FR-006):
  1. Active tracker draft with non-empty `title` → `title`
  2. Active tracker draft without `title` → `category.name`
  3. No active draft → `"—"` fallback (spec edge case: activity with no name)
- Names longer than **24 characters** are truncated to 23 + `…` (spec edge case: very long
  names). Applied to the resolved name before joining with the countdown.
- Template images adapt automatically to light/dark menu bars.
- Repaint gating: the Tray is updated only when the mode or the formatted title changes.

## Dropdown menu (left-click / click opens the context menu)

Structure top → bottom (FR-008):

```
─────────────────────────────────────────────
Start Pomodoro        [disabled while running]
Resume                [shown instead of Start when a phase is paused/armed-but-not-running; disabled while running]
Stop                  [disabled when idle]
─────────────────────────────────────────────
✓ Remind me to start a pomodoro   [checkable toggle; persisted]
─────────────────────────────────────────────
Open App
Quit App
─────────────────────────────────────────────
```

- **Start / Resume**: same engine action (D3/D4) — starts focus from idle or re-arms the
  remaining time of the current phase. Menu-bar-started focus also starts a tracker draft with
  the persisted selected activity, when one exists and no draft is active (bound session).
- **Stop**: stops the countdown; stops (finalizes into `Session`) the bound tracker draft if
  any. Independent in-app tracker sessions are untouched (FR-013).
- **Remind me to start a pomodoro**: checkable item ↔ `reminderEnabled` (FR-014). Off ⇒ zero
  reminders (SC-005). Persisted across relaunch.
- **Open App**: shows + focuses the main window; restores the Dock icon while the window is
  open (FR-003, D5). Disabled only while the local server is still starting.
- **Quit App**: full quit — removes the tray item, stops the reminder cycle, finalizes nothing
  silently (an in-progress timer is abandoned per spec edge case), stops the embedded server
  process, exits (FR-004, SC-006). Routed through the existing `isQuitting`/`before-quit` path.

## Behavior rules

- The menu is rebuilt from the current `MenuBarDisplayState` whenever state changes
  (enable/disable flags stay accurate).
- No activity picker, no activity submenu, no timer-length options — controls only (FR-006,
  clarified decision: no activity picker in the menu bar).
- Tray exists only on `darwin` builds; other platforms unaffected (spec edge case).
- Clicking the item while the window is closed and the server not ready: menu still renders;
  Start works (pomodoro runs regardless of window), Open App shows the window as soon as the
  server is ready.

## Accessibility & failure

- Blocked/absent notifications never affect the menu (silent no-op reminders).
- The tray is recreated if destroyed externally is not possible — `app.dock.hide()` does not
  remove the status item.
