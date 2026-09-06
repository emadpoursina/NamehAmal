import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPomodoroNotificationStatus,
  isNotificationSupported,
  requestPomodoroNotificationPermission,
  shouldShowBackgroundNotification,
  showPomodoroPhaseNotification,
} from "./notifications";

describe("pomodoro notifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an opted-in notification only when the document is hidden", () => {
    expect(shouldShowBackgroundNotification(true, "granted", "hidden")).toBe(
      true,
    );
    expect(shouldShowBackgroundNotification(true, "granted", "visible")).toBe(
      false,
    );
    expect(shouldShowBackgroundNotification(false, "granted", "hidden")).toBe(
      false,
    );
    expect(shouldShowBackgroundNotification(true, "denied", "hidden")).toBe(
      false,
    );
  });

  it("handles a missing Notification API without throwing", async () => {
    vi.stubGlobal("window", {});

    expect(isNotificationSupported()).toBe(false);
    expect(getPomodoroNotificationStatus()).toBe("unsupported");
    await expect(requestPomodoroNotificationPermission()).resolves.toBe(
      "unsupported",
    );
    expect(showPomodoroPhaseNotification("focus", "short_rest")).toBe(false);
  });

  it("requests permission through the browser API", async () => {
    const requestPermission = vi.fn(
      async () => "granted" as NotificationPermission,
    );
    vi.stubGlobal("window", {
      Notification: {
        permission: "default",
        requestPermission,
      },
    });

    await expect(requestPomodoroNotificationPermission()).resolves.toBe(
      "granted",
    );
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it("names both phases and focuses the app when clicked", () => {
    const focus = vi.fn();
    const close = vi.fn();
    const notifications: Array<{
      title: string;
      options?: NotificationOptions;
      onclick: (() => void) | null;
    }> = [];
    class MockNotification {
      static permission: NotificationPermission = "granted";
      onclick: (() => void) | null = null;

      constructor(
        public title: string,
        public options?: NotificationOptions,
      ) {
        notifications.push(this);
      }

      close = close;
    }
    vi.stubGlobal("window", {
      Notification: MockNotification,
      focus,
    });

    expect(showPomodoroPhaseNotification("focus", "short_rest")).toBe(true);
    expect(notifications[0]).toMatchObject({
      title: "Pomodoro phase complete",
      options: {
        body: "Focus complete. Up next: Short rest.",
      },
    });

    notifications[0].onclick?.();
    expect(focus).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("handles a notification construction failure", () => {
    class FailingNotification {
      static permission: NotificationPermission = "granted";

      constructor() {
        throw new Error("blocked");
      }
    }
    vi.stubGlobal("window", { Notification: FailingNotification });

    expect(showPomodoroPhaseNotification("focus", "short_rest")).toBe(false);
  });
});
