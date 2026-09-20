// Idle reminder cycle (US4): every 5 idle minutes a non-blocking macOS banner
// reminds the user to start a pomodoro. Data model §6, research D8.
//
// Pure decision function + a thin shell with a single `setInterval` (D10).

export const REMINDER_INTERVAL_MS = 5 * 60_000;

export type ReminderDecisionInput = {
  reminderEnabled: boolean;
  isPomodoroRunning: boolean;
};

/**
 * Remind iff reminders are enabled and no pomodoro is running. There is no
 * pause state in the engine (D4): a non-running phase counts as idle.
 */
export function shouldRemind(input: ReminderDecisionInput): boolean {
  return input.reminderEnabled && !input.isPomodoroRunning;
}

export type ReminderMessage = { title: string; body: string };

export const REMINDER_MESSAGE: ReminderMessage = {
  title: "NamehAmal",
  body: "Ready to start a pomodoro?",
};

export type ReminderCycleOptions = {
  /** Interval between reminder opportunities (default 5 minutes). */
  intervalMs?: number;
  /** Deliver a reminder (shows the Electron `Notification` banner). */
  deliver: (message: ReminderMessage) => void;
  /** Current decision inputs, evaluated on every tick. */
  decide: () => ReminderDecisionInput;
};

/**
 * Single-interval reminder shell. `start()` arms the cycle; `reset()` re-arms it
 * from now (called when any pomodoro starts or the engine returns to idle) so
 * the next reminder lands exactly one interval after the new idle onset
 * (FR-011). Notifications never stack: at most one delivery per tick.
 */
export class ReminderCycle {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(private readonly options: ReminderCycleOptions) {
    this.intervalMs = options.intervalMs ?? REMINDER_INTERVAL_MS;
  }

  /** Arm the cycle from now; the first reminder lands one interval later. */
  start(): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  /** Re-arm from the current moment (FR-011: never stacks, always re-arms). */
  reset(): void {
    this.start();
  }

  /** Disarm without re-arming (used on quit). */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    if (!shouldRemind(this.options.decide())) return;
    this.options.deliver(REMINDER_MESSAGE);
  }
}
