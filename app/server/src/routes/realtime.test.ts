import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/connection.js", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      noteLifecycle: {
        findFirst: vi.fn(),
      },
      activityLog: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../middleware/auth.js", () => ({
  getFirebaseUid: vi.fn(),
}));

vi.mock("../lib/users.js", () => ({
  resolveUserId: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../lib/config.js", () => ({
  loadConfig: vi.fn(() => ({
    openaiApiKey: "test-openai-key",
    nodeEnv: "production",
    openaiModels: {
      realtime: "gpt-realtime-test",
      realtimeTranscription: "gpt-4o-mini-transcribe",
    },
  })),
}));

vi.mock("../lib/session-quota.js", () => ({
  getSessionQuota: vi.fn(),
}));

vi.mock("../lib/session-tracker.js", () => ({
  trackSessionStart: vi.fn(),
  trackSessionEnd: vi.fn(),
}));

import { realtimeRoute } from "./realtime.js";

let db: typeof import("../db/connection.js").db;
let getFirebaseUid: typeof import("../middleware/auth.js").getFirebaseUid;
let resolveUserId: typeof import("../lib/users.js").resolveUserId;
let getSessionQuota: typeof import("../lib/session-quota.js").getSessionQuota;
let trackSessionStart: typeof import("../lib/session-tracker.js").trackSessionStart;
let trackSessionEnd: typeof import("../lib/session-tracker.js").trackSessionEnd;

const insertValuesMock = vi.fn();
const updateWhereMock = vi.fn();
const updateSetMock = vi.fn(() => ({
  where: updateWhereMock,
}));

const validSessionConfig = {
  instructions: "こんにちは",
  voice: "shimmer",
  tools: [{ name: "end_conversation" }],
  turn_detection: {
    type: "server_vad",
    silence_duration_ms: 800,
  },
};

beforeEach(async () => {
  vi.clearAllMocks();

  db = (await import("../db/connection.js")).db;
  getFirebaseUid = (await import("../middleware/auth.js")).getFirebaseUid;
  resolveUserId = (await import("../lib/users.js")).resolveUserId;
  getSessionQuota = (await import("../lib/session-quota.js")).getSessionQuota;
  trackSessionStart = (await import("../lib/session-tracker.js"))
    .trackSessionStart;
  trackSessionEnd = (await import("../lib/session-tracker.js")).trackSessionEnd;

  vi.mocked(getFirebaseUid).mockReturnValue("firebase-uid");
  vi.mocked(resolveUserId).mockResolvedValue("user-1");
  vi.mocked(db.insert).mockReturnValue({
    values: insertValuesMock,
  } as never);
  vi.mocked(db.update).mockReturnValue({
    set: updateSetMock,
  } as never);
  insertValuesMock.mockResolvedValue(undefined);
  updateWhereMock.mockResolvedValue(undefined);
  vi.mocked(trackSessionStart).mockReturnValue("session-key-1");
  vi.mocked(trackSessionEnd).mockReturnValue(undefined);
  vi.mocked(getSessionQuota).mockResolvedValue({
    maxDaily: 3,
    usedToday: 0,
    remaining: 3,
    maxMonthly: null,
    usedThisMonth: null,
    remainingThisMonth: null,
    limitPeriod: null,
    canStart: true,
  });
  vi.stubGlobal("fetch", vi.fn());
});

describe("realtimeRoute", () => {
  it("uses the GA realtime calls payload without beta headers", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      onboardingCompletedAt: new Date("2026-03-06T00:00:00.000Z"),
    } as never);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("v=0\r\n"),
      headers: new Headers(),
    } as never);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionConfig: validSessionConfig,
          sdp: "v=0\r\n",
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openai-key",
        }),
      }),
    );

    const [, requestInit] = vi.mocked(global.fetch).mock.calls[0] ?? [];
    expect(requestInit).toBeDefined();

    const headers = new Headers(requestInit?.headers);
    expect(headers.get("OpenAI-Beta")).toBeNull();

    const formData = requestInit?.body;
    expect(formData).toBeInstanceOf(FormData);

    const submittedFormData = formData as FormData;
    expect(submittedFormData.get("sdp")).toBe("v=0\r\n");

    const rawSession = submittedFormData.get("session");
    expect(typeof rawSession).toBe("string");

    const openaiSession = JSON.parse(rawSession as string) as Record<
      string,
      unknown
    >;
    expect(openaiSession).toMatchObject({
      type: "realtime",
      model: "gpt-realtime-test",
      output_modalities: ["audio"],
      instructions: "こんにちは",
      tool_choice: "auto",
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 800,
          },
          noise_reduction: { type: "far_field" },
        },
        output: {
          voice: "shimmer",
        },
      },
    });
    expect(openaiSession).not.toHaveProperty("temperature");
  });

  it("does not allow onboarding flag to bypass quota after onboarding is complete", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: "太郎",
      characterId: null,
      fontSize: "standard",
      speakingSpeed: "normal",
      silenceDuration: "normal",
      confirmationLevel: "normal",
      onboardingCompletedAt: new Date("2026-03-06T00:00:00.000Z"),
    } as never);
    vi.mocked(getSessionQuota).mockResolvedValue({
      maxDaily: 3,
      usedToday: 3,
      remaining: 0,
      maxMonthly: null,
      usedThisMonth: null,
      remainingThisMonth: null,
      limitPeriod: "daily",
      canStart: false,
    });

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionConfig: validSessionConfig,
          sdp: "v=0\r\n",
          onboarding: true,
        }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "DAILY_QUOTA_EXCEEDED",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns monthly quota exceeded when monthly limit is reached", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      onboardingCompletedAt: new Date("2026-03-06T00:00:00.000Z"),
    } as never);
    vi.mocked(getSessionQuota).mockResolvedValue({
      maxDaily: 3,
      usedToday: 1,
      remaining: 2,
      maxMonthly: 3,
      usedThisMonth: 3,
      remainingThisMonth: 0,
      limitPeriod: "monthly",
      canStart: false,
    });

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionConfig: validSessionConfig,
          sdp: "v=0\r\n",
        }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      code: "MONTHLY_QUOTA_EXCEEDED",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("accepts onboarding session-end using onboarding activity records", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      onboardingCompletedAt: new Date("2026-03-06T00:00:00.000Z"),
    } as never);
    vi.mocked(db.query.activityLog.findFirst).mockResolvedValue({
      id: "log-1",
      action: "realtime_onboarding_started",
    } as never);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/session-end", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionKey: "session-key-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(trackSessionEnd).toHaveBeenCalledWith("session-key-1");
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "realtime_onboarding_ended",
        resourceId: "session-key-1",
      }),
    );
  });

  it("counts quota only after session activation", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      onboardingCompletedAt: new Date("2026-03-06T00:00:00.000Z"),
    } as never);
    vi.mocked(db.query.activityLog.findFirst)
      .mockResolvedValueOnce({
        id: "start-1",
        action: "realtime_session_started",
      } as never)
      .mockResolvedValueOnce(undefined);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/session-activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionKey: "session-key-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      counted: true,
    });
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "realtime_session_activated",
        resourceId: "session-key-1",
      }),
    );
  });

  it("does not count onboarding sessions on activation", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      onboardingCompletedAt: new Date("2026-03-06T00:00:00.000Z"),
    } as never);
    vi.mocked(db.query.activityLog.findFirst).mockResolvedValue({
      id: "start-1",
      action: "realtime_onboarding_started",
    } as never);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/session-activate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionKey: "session-key-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      counted: false,
    });
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("marks onboarding complete only for an active onboarding session", async () => {
    vi.mocked(db.query.activityLog.findFirst).mockResolvedValue({
      id: "start-1",
    } as never);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/complete-onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionKey: "session-key-1" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
    });
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompletedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("blocks normal sessions until onboarding is complete", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      onboardingCompletedAt: null,
    } as never);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionConfig: validSessionConfig,
          sdp: "v=0\r\n",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "ONBOARDING_REQUIRED",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("allows repeated onboarding sessions while onboarding is incomplete", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValue({
      name: "",
      characterId: null,
      fontSize: "standard",
      speakingSpeed: "normal",
      silenceDuration: "normal",
      confirmationLevel: "normal",
      onboardingCompletedAt: null,
    } as never);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("v=0\r\n"),
      headers: new Headers(),
    } as never);

    const response = await realtimeRoute.fetch(
      new Request("http://localhost/api/realtime/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionConfig: validSessionConfig,
          sdp: "v=0\r\n",
          onboarding: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      sessionKey: "session-key-1",
      answerSdp: "v=0\r\n",
    });
  });
});
