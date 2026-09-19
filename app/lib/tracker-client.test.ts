import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActiveTimerConflictError,
  fetchActiveTimer,
  startTimer,
  stopTimer,
  switchTimer,
} from "./tracker-client";

type FakeResponseInit = { status?: number };

function jsonResponse(body: unknown, init: FakeResponseInit = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

describe("tracker client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the active timer or null", async () => {
    stubFetch(() => jsonResponse({ ok: true, data: null }));
    await expect(fetchActiveTimer()).resolves.toBeNull();

    stubFetch(() => jsonResponse({ ok: true, data: { id: "t1" } }));
    await expect(fetchActiveTimer()).resolves.toEqual({ id: "t1" });
  });

  it("posts action=start and returns the created session", async () => {
    const fetchMock = stubFetch(() =>
      jsonResponse({ ok: true, data: { id: "new" } }, { status: 201 }),
    );

    const created = await startTimer({
      categoryId: "c1",
      title: "Deep work",
      timeZone: "Asia/Yerevan",
    });

    expect(created).toEqual({ id: "new" });
    const body = parseBody(fetchMock.mock.calls[0][1]);
    expect(body).toMatchObject({
      action: "start",
      categoryId: "c1",
      title: "Deep work",
      timeZone: "Asia/Yerevan",
    });
  });

  it("posts action=stop", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ok: true }));

    await stopTimer("t1");

    const body = parseBody(fetchMock.mock.calls[0][1]);
    expect(body).toEqual({ action: "stop", sessionId: "t1" });
  });

  it("switches activity by stopping the old timer before starting the new one", async () => {
    const calls: string[] = [];
    stubFetch((_url, init) => {
      const body = parseBody(init);
      calls.push(body.action as string);
      if (body.action === "stop") return jsonResponse({ ok: true });
      return jsonResponse({ ok: true, data: { id: "new" } }, { status: 201 });
    });

    const created = await switchTimer("old", {
      categoryId: "c2",
      title: null,
      timeZone: "Asia/Yerevan",
    });

    expect(calls).toEqual(["stop", "start"]);
    expect(created).toEqual({ id: "new" });
  });

  it("raises a conflict error when another timer is already running", async () => {
    stubFetch(() =>
      jsonResponse(
        { ok: false, error: "A timer session is already running.", data: { id: "other" } },
        { status: 409 },
      ),
    );

    await expect(
      startTimer({ categoryId: "c1", title: null, timeZone: "Asia/Yerevan" }),
    ).rejects.toBeInstanceOf(ActiveTimerConflictError);
  });
});
