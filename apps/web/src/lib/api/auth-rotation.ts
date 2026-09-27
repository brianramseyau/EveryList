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

const LAST_ROTATION_KEY = 'everylist:token-rotated-at';

let interval: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let started = false;
/** Set while a rotation request is in flight — overlapping attempts (e.g. the daily tick vs a
 * return-to-foreground trigger landing milliseconds later) would both send the same token, and
 * since `refresh` revokes the request's own token, the second one 401s and — via `apiFetch`'s
 * 401 handling — can clear the first attempt's replacement before it's stored. Serializing is
 * enough here (this module is the only caller); cross-tab coordination isn't attempted because
 * tabs each hold their own independent token, so there is no shared session to race. */
let rotationInFlight = false;

/** When the stored session was last rotated, or 0 for "never". A failed rotation deliberately
 * does not update this — the next trigger retries without waiting another full interval. */
function lastRotationAt(): number {
	if (typeof window === 'undefined') return 0;
	const raw = window.localStorage.getItem(LAST_ROTATION_KEY);
	const parsed = raw ? Number(raw) : 0;
	return Number.isFinite(parsed) ? parsed : 0;
}

function markRotation(): void {
	window.localStorage.setItem(LAST_ROTATION_KEY, String(Date.now()));
}

/** True when a rotation is due — i.e. the stored session hasn't been rotated within the last
 * ROTATION_INTERVAL_MS. Deliberately NOT rotated on every page load: the layout remounts on
 * every reload and SPA entry, and rotating that often would revoke the stored token while the
 * page's own parallel data fetches are still in flight with the old one — their 401s then wipe
 * the freshly-rotated session (observed live: every E2E reload logged the session out). */
function rotationDue(): boolean {
	return Date.now() - lastRotationAt() >= ROTATION_INTERVAL_MS;
}

/**
 * Rotates the session token once, if one is stored and a rotation is due. Best-effort by design:
 * a failure (offline, server down) just means this rotation is skipped and the next trigger is
 * attempted on schedule — an expired token's 401 is handled by `apiFetch` (clears the token) and
 * the login redirect, never by this module.
 */
export async function rotateToken(): Promise<void> {
	const requestToken = getToken();
	if (!requestToken) return;
	if (rotationInFlight) return;
	if (!rotationDue()) return;
	rotationInFlight = true;
	try {
		const response = await apiPost<AuthResponse>('/api/v1/account/refresh');
		// Only adopt the new token while the very session that started this request is still the
		// stored one — a concurrent logout (clears it), a 401 elsewhere (clears it), or a
		// different user logging in mid-request must never be overwritten with the rotated one.
		if (getToken() === requestToken) {
			setToken(response.token);
			markRotation();
		}
	} catch {
		// Best-effort — see above.
	} finally {
		rotationInFlight = false;
	}
}

/**
 * Starts proactive session-token rotation: a due check on every daily interval tick, plus on
 * every return-to-foreground (mobile OSes suspend timers while backgrounded, so a device
 * resuming after days asleep otherwise wouldn't rotate until the next tick). Both are no-ops
 * unless the stored session was last rotated more than ROTATION_INTERVAL_MS ago.
 *
 * Deliberately NOT at page load: the layout mounts on every cold start and reload, and a
 * rotation fired there races the page's own mount-time data fetches — refresh revokes the
 * request's token, so fetches still in flight with the old token 401 (observed live: every
 * reload could log the session out, failing the offline-sync/sortable E2E suites). Both
 * remaining triggers fire only while the app is already running (a foreground return after the
 * load has settled), so no mount-time fetch can be in flight.
 *
 * Call once, e.g. from the root layout; safe to call from a server-rendering context (no-ops
 * without `window`) and idempotent across remounts.
 *
 * Impersonation is deliberately left alone: the 1-hour impersonation token is intentionally
 * short-lived and `refresh` rejects it server-side, so its 401 is the expected lifecycle, not a
 * bug to paper over — and a rotation attempt is harmless anyway (it fails, nothing changes).
 */
export function startAuthRotation(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

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
	rotationInFlight = false;
	window.localStorage.removeItem(LAST_ROTATION_KEY);
}
