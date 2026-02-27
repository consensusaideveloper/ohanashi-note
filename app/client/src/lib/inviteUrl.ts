import { INVITE_PATH_PREFIX } from "./constants";

/**
 * Extract invitation token from the current URL pathname.
 * Returns the token string if the URL matches /invite/{token}, or null otherwise.
 */
export function getInviteTokenFromUrl(): string | null {
  const { pathname } = window.location;
  if (pathname.startsWith(INVITE_PATH_PREFIX)) {
    const token = pathname.slice(INVITE_PATH_PREFIX.length);
    if (token.length > 0 && !token.includes("/")) {
      return token;
    }
  }
  return null;
}
