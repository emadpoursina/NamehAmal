// macOS menu bar item (US1..US4). Contracts: contracts/tray.md, research D5/D9.
//
// Thin Electron shell over the pure helpers in `tray-label.ts`; all state comes
// from the main-process pomodoro host (single authority, FR-009). darwin-only.

import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import path from "node:path";

import type { PomodoroSnapshot } from "./ipc-channels.js";
import {
  computeMenuBarDisplayState,
  computeMenuBarMenuModel,
  shouldRepaintTray,
  type MenuBarDisplayState,
} from "./tray-label.js";

export type MenuBarTrayOptions = {
  /** Directory containing `tray-idle.png` / `tray-running.png`. */
  assetsDirectory?: string;
  isServerReady: () => boolean;
  onOpenApp: () => void;
  onQuitApp: () => void;
  onStartPomodoro: () => void;
  onStopPomodoro: () => void;
  onSetReminderEnabled: (enabled: boolean) => void;
};

const REMINDER_LABEL = "Remind me to start a pomodoro";

/**
 * Wraps the Tray lifecycle: create with the idle template glyph and empty
 * title (FR-007), rebuild the dropdown from the current display state on every
 * change, and gate `setTitle`/`setImage` repaints (D9).
 */
export class MenuBarTray {
  private tray: Tray | null = null;
  private idleIcon: Electron.NativeImage | null = null;
  private runningIcon: Electron.NativeImage | null = null;
  private lastDisplay: MenuBarDisplayState | null = null;
  private lastSnapshot: PomodoroSnapshot | null = null;

  constructor(private readonly options: MenuBarTrayOptions) {}

  /** Create the status item (darwin only); no-op elsewhere. */
  create(): void {
    if (this.tray !== null) return;
    if (process.platform !== "darwin") return;

    // T035/FR-007: the glyphs live at `<app>/electron/assets` in both dev
    // (project root via `app.getAppPath()`) and packaged builds (inside the
    // asar — `electron-builder.yml` ships `electron/assets/**/*` via `files`,
    // and `nativeImage.createFromPath` reads through asar archives).
    const assetsDirectory =
      this.options.assetsDirectory ??
      path.join(app.getAppPath(), "electron", "assets");
    this.idleIcon = this.loadTemplateImage(
      path.join(assetsDirectory, "tray-idle.png"),
    );
    this.runningIcon = this.loadTemplateImage(
      path.join(assetsDirectory, "tray-running.png"),
    );

    this.tray = new Tray(this.idleIcon);
    this.tray.setToolTip("NamehAmal");
    // Build the initial menu so a click always renders the dropdown.
    this.rebuildMenu();
  }

  /** Apply the latest host snapshot: icons, title, and menu (repaint-gated). */
  update(snapshot: PomodoroSnapshot, activityName: string): void {
    if (this.tray === null) return;

    const display = computeMenuBarDisplayState(snapshot.state, activityName);
    if (shouldRepaintTray(this.lastDisplay, display)) {
      const icon =
        display.mode === "running"
          ? (this.runningIcon ?? this.idleIcon)
          : this.idleIcon;
      if (icon !== null) {
        this.tray.setImage(icon);
        this.tray.setTitle(display.title);
        this.lastDisplay = display;
      }
    }

    const menuChanged =
      this.lastSnapshot === null ||
      this.lastSnapshot.state.phase !== snapshot.state.phase ||
      this.lastSnapshot.state.isRunning !== snapshot.state.isRunning ||
      this.lastSnapshot.reminderEnabled !== snapshot.reminderEnabled;
    this.lastSnapshot = snapshot;
    if (menuChanged) {
      this.rebuildMenu();
    }
  }

  /** Remove the status item (FR-004: no orphaned tray on quit). */
  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
    this.lastDisplay = null;
    this.lastSnapshot = null;
  }

  private loadTemplateImage(filePath: string): Electron.NativeImage {
    const image = nativeImage.createFromPath(filePath);
    image.setTemplateImage(true); // adapts to light/dark menu bars
    return image;
  }

  /** Rebuild the dropdown from the current state (no picker, no lengths, FR-006). */
  private rebuildMenu(): void {
    if (this.tray === null || this.lastSnapshot === null) {
      // Before the first snapshot: minimal Open App / Quit App menu (US1 base).
      if (this.tray !== null) {
        this.tray.setContextMenu(
          Menu.buildFromTemplate([
            {
              label: "Open App",
              enabled: this.options.isServerReady(),
              click: () => this.options.onOpenApp(),
            },
            { type: "separator" },
            {
              label: "Quit App",
              click: () => this.options.onQuitApp(),
            },
          ]),
        );
      }
      return;
    }

    const { state, reminderEnabled } = this.lastSnapshot;
    const menu = computeMenuBarMenuModel(state);
    const items: MenuItemConstructorOptions[] = [];

    if (menu.showResume) {
      items.push({
        label: "Resume",
        enabled: menu.canStart,
        click: () => this.options.onStartPomodoro(),
      });
    } else {
      items.push({
        label: "Start Pomodoro",
        enabled: menu.canStart,
        click: () => this.options.onStartPomodoro(),
      });
    }
    items.push({
      label: "Stop",
      enabled: menu.canStop,
      click: () => this.options.onStopPomodoro(),
    });
    items.push({ type: "separator" });
    items.push({
      label: REMINDER_LABEL,
      type: "checkbox",
      checked: reminderEnabled,
      click: (item) => this.options.onSetReminderEnabled(item.checked),
    });
    items.push({ type: "separator" });
    items.push({
      label: "Open App",
      enabled: this.options.isServerReady(),
      click: () => this.options.onOpenApp(),
    });
    items.push({
      label: "Quit App",
      click: () => this.options.onQuitApp(),
    });

    this.tray.setContextMenu(Menu.buildFromTemplate(items));
  }
}
