import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FALLBACK_ACTIVITY_NAME,
  resolveActivityLabel,
  resolvePomodoroConnection,
  snapshotToActivityName,
  type PomodoroSnapshotInput,
  type PomodoroSnapshotResult,
} from "./desktop-connection";
import { DEFAULT_POMODORO_SETTINGS } from "./types";

// ---------------------------------------------------------------------------
// Minimal React runtime for provider-level tests (T006/T015/T016).
//
// The repo has no jsdom/testing-library and the plan forbids new dependencies,
// so we drive the real PomodoroProvider with a tiny hook runtime: enough of
// useState/useEffect/useRef/useMemo/useCallback/useContext/
// useSyncExternalStore + the JSX runtime to render the provider once per
// committed state (effects run after render, exactly like React).
// ---------------------------------------------------------------------------

const rt = vi.hoisted(() => {
  type Deps = unknown[] | undefined;
  type Instance = {
    hooks: Array<Record<string, unknown>>;
    cursor: number;
    effects: Array<() => void>;
  };

  const state = {
    instance: null as Instance | null,
    rootComponent: null as null | ((props: Record<string, unknown>) => unknown),
    rootProps: {} as Record<string, unknown>,
    scheduled: false,
    renderCount: 0,
  };

  function renderRoot() {
    const inst = state.instance;
    if (!inst || !state.rootComponent) return;
    inst.cursor = 0;
    inst.effects = [];
    renderElement(state.rootComponent(state.rootProps));
    state.renderCount += 1;
    const effects = inst.effects;
    inst.effects = [];
    for (const run of effects) run();
  }

  function scheduleRerender() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => {
      state.scheduled = false;
      renderRoot();
    });
  }

  function renderElement(el: unknown): void {
    if (el === null || el === undefined || typeof el === "boolean") return;
    if (Array.isArray(el)) {
      for (const child of el) renderElement(child);
      return;
    }
    const { type, props } = el as { type: unknown; props: Record<string, unknown> };
    if (typeof type === "function") {
      renderElement((type as (p: Record<string, unknown>) => unknown)(props));
      return;
    }
    if (props && "children" in props) {
      const children = props.children;
      if (Array.isArray(children)) {
        for (const child of children) renderElement(child);
      } else {
        renderElement(children);
      }
    }
  }

  function nextHook<T extends Record<string, unknown>>(init: T): T {
    const inst = state.instance!;
    const i = inst.cursor++;
    if (!(i in inst.hooks)) inst.hooks[i] = init;
    return inst.hooks[i] as T;
  }

  function depsChanged(a: Deps, b: Deps): boolean {
    if (a === undefined || b === undefined) return true;
    if (a.length !== b.length) return true;
    return a.some((dep, i) => !Object.is(dep, b[i]));
  }

  const reactMock = {
    createContext<T>(defaultValue: T) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx: any = { currentValue: defaultValue as unknown };
      ctx.Provider = (props: { value: unknown; children: unknown }) => {
        ctx.currentValue = props.value;
        return props.children;
      };
      return ctx as { currentValue: unknown; Provider: unknown };
    },
    useContext(ctx: { currentValue: unknown }) {
      return ctx.currentValue;
    },
    useState<S>(init: S | (() => S)) {
      const hook = nextHook<{ value: S }>({
        value: typeof init === "function" ? (init as () => S)() : init,
      });
      const setValue = (v: S | ((prev: S) => S)) => {
        const nextValue =
          typeof v === "function" ? (v as (prev: S) => S)(hook.value) : v;
        if (!Object.is(nextValue, hook.value)) {
          hook.value = nextValue;
          scheduleRerender();
        }
      };
      return [hook.value, setValue] as const;
    },
    useRef<T>(init: T) {
      return nextHook<{ current: T }>({ current: init });
    },
    useCallback<T>(fn: T, deps: Deps) {
      const hook = nextHook<{ fn: T; deps: Deps }>({ fn, deps });
      if (depsChanged(hook.deps, deps)) {
        hook.fn = fn;
        hook.deps = deps;
      }
      return hook.fn;
    },
    useMemo<T>(factory: () => T, deps: Deps) {
      const hook = nextHook<{ value: T; deps: Deps }>({
        value: undefined as unknown as T,
        deps: undefined,
      });
      if (depsChanged(hook.deps, deps)) {
        hook.value = factory();
        hook.deps = deps;
      }
      return hook.value;
    },
    useEffect(fn: () => void | (() => void), deps: Deps) {
      const inst = state.instance!;
      const i = inst.cursor++;
      if (!(i in inst.hooks)) {
        inst.hooks[i] = { deps: undefined, cleanup: undefined };
      }
      const hook = inst.hooks[i] as { deps: Deps; cleanup?: () => void };
      if (depsChanged(hook.deps, deps)) {
        inst.effects.push(() => {
          if (typeof hook.cleanup === "function") hook.cleanup();
          hook.deps = deps;
          hook.cleanup = fn() ?? undefined;
        });
      }
    },
    useSyncExternalStore(
      _subscribe: unknown,
      getSnapshot: () => unknown,
      // Server snapshot intentionally ignored: the fake runtime always renders client-side.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _getServerSnapshot?: () => unknown,
    ) {
      return getSnapshot();
    },
    createElement(
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) {
      return { type, props: { ...(props ?? {}), children } };
    },
  };

  return {
    reactMock,
    jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
    jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
    Fragment: Symbol("Fragment"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(component: (props: any) => unknown, props: Record<string, unknown> = {}) {
      state.instance = { hooks: [], cursor: 0, effects: [] };
      state.rootComponent = component;
      state.rootProps = props;
      state.renderCount = 0;
      renderRoot();
    },
    rerender(props: Record<string, unknown> = {}) {
      state.rootProps = props;
      renderRoot();
    },
    unmount() {
      const inst = state.instance;
      if (!inst) return;
      for (const hook of inst.hooks) {
        if (hook && typeof hook.cleanup === "function") hook.cleanup();
      }
      state.instance = null;
      state.rootComponent = null;
    },
    async settle(turns = 25) {
      for (let i = 0; i < turns; i += 1) {
        await Promise.resolve();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    },
  };
});

vi.mock("react", () => rt.reactMock);
vi.mock("react/jsx-runtime", () => ({
  jsx: rt.jsx,
  jsxs: rt.jsxs,
  Fragment: rt.Fragment,
}));
vi.mock("react/jsx-dev-runtime", () => ({
  jsx: rt.jsx,
  jsxs: rt.jsxs,
  jsxDEV: rt.jsx,
  Fragment: rt.Fragment,
}));
// Rendered children of the provider: keep the graph hook-free and side-effect-free.
vi.mock("./PomodoroPhaseAlert", () => ({ PomodoroPhaseAlert: () => null }));
vi.mock("./PomodoroPhaseNotification", () => ({
  PomodoroPhaseNotification: () => null,
}));

import { PomodoroContext, PomodoroProvider } from "./PomodoroProvider";
import type { NamehAmalDesktop } from "@/electron/ipc-channels";
import type { Mock } from "vitest";

const SETTINGS_KEY = "nameh-amal:pomodoro:settings";
const RUN_KEY = "nameh-amal:pomodoro:run";

type DesktopApiStub = {
  -readonly [K in keyof NamehAmalDesktop]: Mock;
} & {
  pushPomodoroState: (snapshot: PomodoroSnapshotInput) => void;
};

function makeDesktopApiStub(): DesktopApiStub {
  const listeners = new Set<(snapshot: PomodoroSnapshotInput) => void>();
  const api = {
    getPomodoroState: vi.fn(async () => makeSnapshot()),
    startPomodoro: vi.fn(async () => makeSnapshot().state),
    stopPomodoro: vi.fn(async () => makeSnapshot().state),
    skipPomodoro: vi.fn(async () => makeSnapshot().state),
    updatePomodoroSettings: vi.fn(async () => makeSnapshot().state),
    reportSelectedActivity: vi.fn(async () => undefined),
    setReminderEnabled: vi.fn(async (enabled: boolean) => enabled),
    onPomodoroStateChanged: vi.fn((listener: (snapshot: PomodoroSnapshotInput) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    onReminderChanged: vi.fn(() => () => {}),
    pushPomodoroState: (snapshot: PomodoroSnapshotInput) => {
      for (const listener of listeners) listener(snapshot);
    },
  };
  return api as unknown as DesktopApiStub;
}

type StorageRecorder = { calls: string[]; store: Map<string, string> };

function stubWindowWithDesktopApi(api: DesktopApiStub | null): StorageRecorder {
  const recorder: StorageRecorder = { calls: [], store: new Map() };
  const record = (method: string, key: string) => {
    if (key.startsWith("nameh-amal:pomodoro")) {
      recorder.calls.push(`${method}:${key}`);
    }
  };
  const localStorage = {
    getItem: (key: string) => {
      record("get", key);
      return recorder.store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      record("set", key);
      recorder.store.set(key, value);
    },
    removeItem: (key: string) => {
      record("remove", key);
      recorder.store.delete(key);
    },
    clear: () => {
      for (const key of Array.from(recorder.store.keys())) record("remove", key);
      recorder.store.clear();
    },
    key: (index: number) => Array.from(recorder.store.keys())[index] ?? null,
    get length() {
      return recorder.store.size;
    },
  };
  const windowStub: Record<string, unknown> = {
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage,
  };
  if (api !== null) windowStub.namehAmalDesktop = api;
  vi.stubGlobal("window", windowStub);
  return recorder;
}

async function mountPomodoroProvider(): Promise<Record<string, unknown> & {
  start: () => void;
  stop: () => void;
  skip: () => void;
  updateSettings: (partial: Record<string, unknown>) => void;
}> {
  rt.render(PomodoroProvider, { children: null });
  await rt.settle();
  // Live handle: every re-render replaces the context value object, so reads
  // always forward to the latest committed value.
  const currentContext = PomodoroContext as unknown as {
    currentValue: Record<string, unknown> | null;
  };
  return new Proxy({
    start: () => {},
    stop: () => {},
    skip: () => {},
    updateSettings: () => {},
  } as Record<string, unknown> & {
    start: () => void;
    stop: () => void;
    skip: () => void;
    updateSettings: (partial: Record<string, unknown>) => void;
  }, {
    get: (target, prop) =>
      currentContext.currentValue?.[prop as string] ??
      (prop in target ? target[prop as string] : undefined),
  });
}

afterEach(() => {
  rt.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type SnapshotOverride = Partial<Omit<PomodoroSnapshotInput, "state">> & {
  state?: Partial<PomodoroSnapshotInput["state"]>;
};

function makeSnapshot(overrides: SnapshotOverride = {}): PomodoroSnapshotInput {
  const { state: stateOverride, ...rest } = overrides;
  return {
    state: {
      phase: "idle",
      remainingSeconds: DEFAULT_POMODORO_SETTINGS.focusSeconds,
      phaseEndsAtMs: null,
      isRunning: false,
      completedFocusSessions: 0,
      settings: { ...DEFAULT_POMODORO_SETTINGS },
      ...stateOverride,
    },
    selectedActivity: null,
    reminderEnabled: true,
    ...rest,
  };
}

describe("resolvePomodoroConnection (contracts/host-sync.md §5)", () => {
  it("maps a missing desktop API to the local connection", () => {
    expect(
      resolvePomodoroConnection({ hasDesktopApi: false, snapshotResult: null }),
    ).toBe("local");
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: false,
        snapshotResult: makeSnapshot(),
      }),
    ).toBe("local");
  });

  it("stays waiting while the host fetch is pending", () => {
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: true,
        snapshotResult: "pending",
      }),
    ).toBe("waiting");
  });

  it("stays waiting when pomodoro:get-state resolves null (host hydrating)", () => {
    expect(
      resolvePomodoroConnection({ hasDesktopApi: true, snapshotResult: null }),
    ).toBe("waiting");
  });

  it("stays waiting when the snapshot fetch rejects", () => {
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: true,
        snapshotResult: "rejected",
      }),
    ).toBe("waiting");
  });

  it("reaches connected on the first valid snapshot (mount fetch, push, or re-sync)", () => {
    const snapshot = makeSnapshot();
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: true,
        snapshotResult: snapshot,
      }),
    ).toBe("connected");
  });

  it("rejects non-object snapshot results as still waiting", () => {
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: true,
        snapshotResult: "garbage" as unknown as PomodoroSnapshotResult,
      }),
    ).toBe("waiting");
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: true,
        snapshotResult: 42 as unknown as PomodoroSnapshotResult,
      }),
    ).toBe("waiting");
  });

  it("rejects snapshots without a valid state object as still waiting", () => {
    expect(
      resolvePomodoroConnection({
        hasDesktopApi: true,
        snapshotResult: {} as unknown as PomodoroSnapshotInput,
      }),
    ).toBe("waiting");
  });

  it("provides no timeout fallback to a local engine (FR-009)", () => {
    // Every failure mode still maps to waiting — only a valid snapshot or the
    // absence of the desktop API can change the connection.
    const failureModes: unknown[] = ["pending", "rejected", null, "garbage"];
    for (const snapshotResult of failureModes) {
      expect(
        resolvePomodoroConnection({
          hasDesktopApi: true,
          snapshotResult: snapshotResult as PomodoroSnapshotResult,
        }),
      ).toBe("waiting");
    }
  });
});

describe("snapshotToActivityName (FR-012)", () => {
  it("returns null for waiting snapshots with no selected activity", () => {
    expect(snapshotToActivityName(null)).toBeNull();
    expect(snapshotToActivityName("pending")).toBeNull();
    expect(snapshotToActivityName("rejected")).toBeNull();
  });

  it("returns null when the snapshot has no selected activity", () => {
    expect(snapshotToActivityName(makeSnapshot())).toBeNull();
  });

  it("uses the host-reported draft title, else the neutral fallback", () => {
    expect(
      snapshotToActivityName(
        makeSnapshot({
          selectedActivity: {
            categoryId: "cat-1",
            title: "Writing docs",
            reportedAt: 1,
          },
        }),
      ),
    ).toBe("Writing docs");

    // The renderer never polls /api/tracker itself (research.md D5): a
    // blank/missing draft title collapses to the tray's fallback character.
    expect(
      snapshotToActivityName(
        makeSnapshot({
          selectedActivity: {
            categoryId: "cat-1",
            title: "   ",
            reportedAt: 1,
          },
        }),
      ),
    ).toBe(FALLBACK_ACTIVITY_NAME);

    expect(
      snapshotToActivityName(
        makeSnapshot({
          selectedActivity: {
            categoryId: "cat-1",
            title: "",
            reportedAt: 1,
          },
        }),
      ),
    ).toBe(FALLBACK_ACTIVITY_NAME);
  });

  it("prefers the host-resolved activityName when the snapshot carries it (T022, FR-012)", () => {
    // Divergence scenario from the convergence finding: the selected activity
    // has a null title, but the tracker draft's category resolves to a name.
    // The tray shows that name, so the in-app label must be identical.
    expect(
      snapshotToActivityName(
        makeSnapshot({
          activityName: "Deep Work",
          selectedActivity: {
            categoryId: "cat-1",
            title: null,
            reportedAt: 1,
          },
        }),
      ),
    ).toBe("Deep Work");
  });

  it("the host-resolved '—' wins over a stale selected-activity title (T022)", () => {
    // The host is the single source of the shared label (host-sync.md §3):
    // when its poll resolves to the fallback, the app must not resurrect a
    // persisted renderer-reported title the tray no longer shows.
    expect(
      snapshotToActivityName(
        makeSnapshot({
          activityName: FALLBACK_ACTIVITY_NAME,
          selectedActivity: {
            categoryId: "cat-1",
            title: "Writing docs",
            reportedAt: 1,
          },
        }),
      ),
    ).toBe(FALLBACK_ACTIVITY_NAME);
  });

  it("keeps the selected-activity path when the host label field is absent (T022)", () => {
    // Legacy snapshot producers/fixtures without `activityName` keep the
    // pre-T022 behavior so existing consumers never regress.
    expect(
      snapshotToActivityName(
        makeSnapshot({
          activityName: undefined,
          selectedActivity: {
            categoryId: "cat-1",
            title: "Writing docs",
            reportedAt: 1,
          },
        }),
      ),
    ).toBe("Writing docs");
  });

  it("exposes the tray fallback character for empty labels", () => {
    expect(FALLBACK_ACTIVITY_NAME).toBe("—");
  });

  it("resolveActivityLabel applies the neutral fallback to null/—", () => {
    expect(resolveActivityLabel(null)).toBe(FALLBACK_ACTIVITY_NAME);
    expect(resolveActivityLabel("—")).toBe(FALLBACK_ACTIVITY_NAME);
    expect(resolveActivityLabel("Reading")).toBe("Reading");
    expect(resolveActivityLabel("   ")).toBe(FALLBACK_ACTIVITY_NAME);
  });
});

describe("desktop store isolation (FR-004, INV-1; contracts/host-sync.md §4)", () => {
  let storageCalls: string[];

  beforeEach(() => {
    storageCalls = [];
    const store = new Map<string, string>();
    const record = (method: string, key: string | null) => {
      if (key !== null && key.startsWith("nameh-amal:pomodoro")) {
        storageCalls.push(`${method}:${key}`);
      }
    };
    const storage = {
      getItem: (key: string) => {
        record("get", key);
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        record("set", key);
        store.set(key, value);
      },
      removeItem: (key: string) => {
        record("remove", key);
        store.delete(key);
      },
      clear: () => {
        record("clear", null);
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    };
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records nothing when the desktop connection helper guards the local store", () => {
    // The guard the provider uses: with the desktop API present, no storage
    // module call is made at all — desktop state flows over IPC only.
    const connection = resolvePomodoroConnection({
      hasDesktopApi: true,
      snapshotResult: null,
    });
    expect(connection).toBe("waiting");
    expect(storageCalls).toEqual([]);
  });
});

describe("PomodoroProvider desktop connection gating (T006, contracts/host-sync.md §1)", () => {
  it("mounts at waiting when the desktop API is present", async () => {
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockImplementation(() => new Promise(() => {})); // never settles
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();

    expect(value.connection).toBe("waiting");
    expect(api.onPomodoroStateChanged).toHaveBeenCalledTimes(1); // subscribed before fetch
  });

  it("stays waiting when pomodoro:get-state resolves null or rejects", async () => {
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockResolvedValueOnce(null);
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();
    expect(value.connection).toBe("waiting");

    api.getPomodoroState.mockRejectedValueOnce(new Error("ipc down"));
    await rt.settle();
    expect(value.connection).toBe("waiting");
  });

  it("reaches connected on the first valid snapshot from the mount fetch", async () => {
    const snapshot = makeSnapshot();
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockResolvedValueOnce(snapshot);
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();

    expect(value.connection).toBe("connected");
    expect(value.state).toEqual(snapshot.state);
  });

  it("reaches connected on a pomodoro:state-changed push while the fetch is pending", async () => {
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockImplementation(() => new Promise(() => {}));
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();
    expect(value.connection).toBe("waiting");

    const snapshot = makeSnapshot();
    api.pushPomodoroState(snapshot);
    await rt.settle();

    expect(value.connection).toBe("connected");
    expect(value.state).toEqual(snapshot.state);
  });

  it("reaches connected on the did-finish-load re-sync push after a failed fetch", async () => {
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockRejectedValueOnce(new Error("host hydrating"));
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();
    expect(value.connection).toBe("waiting");

    const snapshot = makeSnapshot();
    api.pushPomodoroState(snapshot); // did-finish-load re-sync uses the same channel
    await rt.settle();

    expect(value.connection).toBe("connected");
    expect(value.state).toEqual(snapshot.state);
  });

  it("never falls back to a local engine while waiting (no timeout, no interval)", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockRejectedValueOnce(new Error("down"));
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();
    await rt.settle(10);

    expect(value.connection).toBe("waiting");
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("keeps controls inert while waiting and applies them to the shared clock once connected", async () => {
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockImplementation(() => new Promise(() => {}));
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();
    value.start();
    value.updateSettings({ focusSeconds: 90 });
    expect(api.startPomodoro).not.toHaveBeenCalled();
    expect(api.updatePomodoroSettings).not.toHaveBeenCalled();

    const running = makeSnapshot({
      state: {
        phase: "focus",
        remainingSeconds: 1500,
        phaseEndsAtMs: 1_000_000,
        isRunning: true,
      },
    });
    api.pushPomodoroState(running);
    await rt.settle();

    const started = running.state;
    api.startPomodoro.mockResolvedValueOnce(started);
    value.start();
    await rt.settle();
    expect(api.startPomodoro).toHaveBeenCalledTimes(1);
  });

  it("exposes the host activity name on the context (FR-012)", async () => {
    const snapshot = makeSnapshot({
      selectedActivity: { categoryId: "cat", title: "Writing docs", reportedAt: 1 },
    });
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockResolvedValueOnce(snapshot);
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();

    expect(value.connection).toBe("connected");
    expect(value.activityName).toBe("Writing docs");
  });

  it("exposes the host-resolved activity name (draft category fallback) on the context (T022, FR-012)", async () => {
    // Same divergence scenario as the helper test: title null, but the host
    // resolved the tracker draft's category name — the tray's exact string.
    const snapshot = makeSnapshot({
      activityName: "Deep Work",
      selectedActivity: { categoryId: "cat", title: null, reportedAt: 1 },
    });
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockResolvedValueOnce(snapshot);
    stubWindowWithDesktopApi(api);

    const value = await mountPomodoroProvider();

    expect(value.connection).toBe("connected");
    expect(value.activityName).toBe("Deep Work");
  });

  it("uses the local engine and connection=local without the desktop API (US3/T011)", async () => {
    const recorder = stubWindowWithDesktopApi(null);
    recorder.store.set(SETTINGS_KEY, JSON.stringify(DEFAULT_POMODORO_SETTINGS));

    const value = await mountPomodoroProvider();

    expect(value.connection).toBe("local");
    expect(recorder.calls).toContain(`get:${SETTINGS_KEY}`); // web store hydration intact
  });
});

describe("PomodoroProvider store isolation with the desktop API present (T015/T016)", () => {
  it("observes ZERO pomodoro localStorage reads/writes during mount, fetch failure, and settings change", async () => {
    const api = makeDesktopApiStub();
    api.getPomodoroState.mockRejectedValueOnce(new Error("host not ready"));
    const recorder = stubWindowWithDesktopApi(api);
    // Pre-seed web-store values that desktop mode must ignore (INV-1).
    recorder.store.set(RUN_KEY, "{}");
    recorder.store.set(SETTINGS_KEY, JSON.stringify(DEFAULT_POMODORO_SETTINGS));

    const value = await mountPomodoroProvider();
    expect(value.connection).toBe("waiting");
    expect(recorder.calls).toEqual([]);

    // Converge via push, then change settings through the shared host store.
    const snapshot = makeSnapshot();
    api.pushPomodoroState(snapshot);
    await rt.settle();

    const nextSettings = { ...DEFAULT_POMODORO_SETTINGS, focusSeconds: 1500 };
    api.updatePomodoroSettings.mockResolvedValueOnce({
      ...snapshot.state,
      settings: nextSettings,
    });
    value.updateSettings({ focusSeconds: 1500 });
    await rt.settle();

    expect(api.updatePomodoroSettings).toHaveBeenCalledWith({ focusSeconds: 1500 });
    expect((value.state as { settings: unknown }).settings).toEqual(nextSettings);
    expect(recorder.calls).toEqual([]); // stores never merge (FR-004)
  });
});
