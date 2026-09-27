import { apiPost } from './client';
import { getToken, setToken } from './token';

interface AuthResponse {
	token: string;
}

/**
 * How often the session token is proactively rotated. The server's login tokens expire a fixed
 * 30 days after login (`apps/api/app/models/user.ts` — no sliding renewal), and `apiFetch` clears
 * the stored token on the resulting 401, which is how a user "gets logged out" despite using the
 * app every day. `POST /api/v1/account/refresh` mints a fresh 30-day token and revokes the old
 * one; rotating daily keeps every actively-used session permanently ahead of that deadline.
 */
const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;

let interval: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let started = false;

/**
 * Rotates the session token once, if one is stored. Best-effort by design: a failure (offline,
 * server down) just means this rotation is skipped and the next one is attempted on schedule —
 * an expired token's 401 is handled by `apiFetch` (clears the token) and the login redirect,
 * never by this module.
 */
export async function rotateToken(): Promise<void> {
	if (!getToken()) return;
	try {
		const response = await apiPost<AuthResponse>('/api/v1/account/refresh');
		// Only adopt the new token while a token is still stored at all — a concurrent logout
		// (or a 401 elsewhere clearing it) must not be overwritten with the rotated one.
		if (getToken()) setToken(response.token);
	} catch {
		// Best-effort — see above.
	}
}

/**
 * Starts proactive session-token rotation: an attempt immediately, then daily, plus on every
 * return-to-foreground (a device resuming after days asleep otherwise wouldn't rotate until the
 * next interval tick, and mobile OSes suspend timers while backgrounded). Call once, e.g. from
 * the root layout; safe to call from a server-rendering context (no-ops without `window`) and
 * idempotent across remounts.
 *
 * Impersonation is deliberately left alone: the 1-hour impersonation token is intentionally
 * short-lived and `refresh` rejects it server-side, so its 401 is the expected lifecycle, not a
 * bug to paper over — and a rotation attempt is harmless anyway (it fails, nothing changes).
 */
export function startAuthRotation(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

	void rotateToken();
	interval = setInterval(() => void rotateToken(), ROTATION_INTERVAL_MS);
	visibilityHandler = () => {
		if (document.visibilityState === 'visible') void rotateToken();
	};
	document.addEventListener('visibilitychange', visibilityHandler);
}

/** Test-only: resets the module-level scheduling state between specs. */
export function resetAuthRotationForTesting(): void {
	if (interval) clearInterval(interval);
	interval = null;
	if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
	visibilityHandler = null;
	started = false;
}
