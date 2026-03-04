import { isIP } from "node:net";

const MAX_IP_HEADER_LENGTH = 256;

export function extractTrustedIpAddress(headers: Headers): string | null {
  const realIp = normalizeIpCandidate(headers.get("x-real-ip"));
  if (realIp !== null) {
    return realIp;
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded === null || forwarded.length > MAX_IP_HEADER_LENGTH) {
    return null;
  }

  const candidates = forwarded
    .split(",")
    .map((part) => normalizeIpCandidate(part))
    .filter((value): value is string => value !== null);

  if (candidates.length === 0) {
    return null;
  }

  // Prefer the last valid hop to reduce simple spoofing when a trusted proxy
  // appends its observed client address to an existing header value.
  return candidates[candidates.length - 1] ?? null;
}

function normalizeIpCandidate(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) {
    return null;
  }
  return isIP(trimmed) === 0 ? null : trimmed;
}
