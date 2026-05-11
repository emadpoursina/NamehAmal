// Lets client components refetch the live timer when another part of the UI starts it (e.g. Record again).

const listeners = new Set<() => void>();

/** Register a refetch callback; returns unsubscribe for cleanup. */
export function subscribeActiveTimerRefresh(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Notify subscribers that the active timer may have changed. */
export function emitActiveTimerRefresh(): void {
  for (const fn of listeners) fn();
}
