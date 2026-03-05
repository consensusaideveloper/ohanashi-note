// In-memory admission control for data exports.
// Protects server resources from expensive concurrent export jobs.

const MAX_GLOBAL_CONCURRENT_EXPORTS = 2;
const EXPORT_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes per user
const MAX_EXPORT_CONVERSATIONS = 1200;
const MAX_AUDIO_EXPORT_CONVERSATIONS = 120;
const BUSY_RETRY_AFTER_SECONDS = 30;
const RUNNING_RETRY_AFTER_SECONDS = 15;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const STALE_COOLDOWN_ENTRY_MS = 24 * 60 * 60 * 1000;

interface ExportGuardState {
  activeUsers: Set<string>;
  activeCount: number;
  lastFinishedAtByUser: Map<string, number>;
}

export interface DataExportLease {
  release: () => void;
}

export interface DataExportStartInput {
  userId: string;
  includeAudio: boolean;
  conversationCount: number;
  nowMs?: number;
}

export interface DataExportRejected {
  allowed: false;
  status: 413 | 429;
  code: string;
  error: string;
  retryAfterSeconds?: number;
}

export interface DataExportAllowed {
  allowed: true;
  lease: DataExportLease;
}

export type DataExportStartResult = DataExportAllowed | DataExportRejected;

const state: ExportGuardState = {
  activeUsers: new Set<string>(),
  activeCount: 0,
  lastFinishedAtByUser: new Map<string, number>(),
};

setInterval(() => {
  const now = Date.now();
  for (const [userId, finishedAt] of state.lastFinishedAtByUser.entries()) {
    if (now - finishedAt > STALE_COOLDOWN_ENTRY_MS) {
      state.lastFinishedAtByUser.delete(userId);
    }
  }
}, CLEANUP_INTERVAL_MS);

function reject(
  status: 413 | 429,
  code: string,
  error: string,
  retryAfterSeconds?: number,
): DataExportRejected {
  return { allowed: false, status, code, error, retryAfterSeconds };
}

/**
 * Attempt to start a new data export, enforcing system-wide and per-user guardrails.
 */
export function tryStartDataExport(
  input: DataExportStartInput,
): DataExportStartResult {
  const now = input.nowMs ?? Date.now();

  if (input.conversationCount > MAX_EXPORT_CONVERSATIONS) {
    return reject(
      413,
      "EXPORT_SCOPE_TOO_LARGE",
      "会話件数が多すぎるため、全件の一括ダウンロードはできません。期間を分けてダウンロードしてください。",
    );
  }

  if (
    input.includeAudio &&
    input.conversationCount > MAX_AUDIO_EXPORT_CONVERSATIONS
  ) {
    return reject(
      413,
      "EXPORT_AUDIO_TOO_LARGE",
      "録音ファイルを含むダウンロードは件数が多すぎます。録音なしでダウンロードするか、期間を分けてください。",
    );
  }

  if (state.activeUsers.has(input.userId)) {
    return reject(
      429,
      "EXPORT_ALREADY_RUNNING",
      "同じアカウントでエクスポートを実行中です。完了後に再度お試しください。",
      RUNNING_RETRY_AFTER_SECONDS,
    );
  }

  if (state.activeCount >= MAX_GLOBAL_CONCURRENT_EXPORTS) {
    return reject(
      429,
      "EXPORT_SERVER_BUSY",
      "現在エクスポートが混み合っています。しばらく待ってから再度お試しください。",
      BUSY_RETRY_AFTER_SECONDS,
    );
  }

  const lastFinishedAt = state.lastFinishedAtByUser.get(input.userId);
  if (
    lastFinishedAt !== undefined &&
    now - lastFinishedAt < EXPORT_COOLDOWN_MS
  ) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((EXPORT_COOLDOWN_MS - (now - lastFinishedAt)) / 1000),
    );
    return reject(
      429,
      "EXPORT_COOLDOWN",
      "連続でエクスポートできる間隔に達していません。少し待ってから再度お試しください。",
      retryAfterSeconds,
    );
  }

  state.activeUsers.add(input.userId);
  state.activeCount += 1;

  let released = false;
  return {
    allowed: true,
    lease: {
      release: () => {
        if (released) return;
        released = true;
        state.activeUsers.delete(input.userId);
        state.activeCount = Math.max(0, state.activeCount - 1);
        state.lastFinishedAtByUser.set(input.userId, Date.now());
      },
    },
  };
}

/**
 * Test-only helper to reset in-memory state.
 */
export function __resetDataExportGuardForTests(): void {
  state.activeUsers.clear();
  state.activeCount = 0;
  state.lastFinishedAtByUser.clear();
}
