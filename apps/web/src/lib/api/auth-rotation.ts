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

/** How long after startup a due rotation waits before firing — long enough for the layout's
 * mount-time data fetches (and the offline flush's initial pass) to have left the wire. A
 * rotation revokes the token it was sent with, so any request still in flight with the old
 * token at that moment would 401 and — via `apiFetch`'s 401 handling — risk wiping the
 * freshly-rotated session. Waiting is what makes the startup check safe to run. */
const STARTUP_SETTLE_MS = 10_000;

let interval: ReturnType<typeof setInterval> | null = null;
let visibilityHandler: (() => void) | null = null;
let started = false;
/** Set while a rotation request is in flight — overlapping attempts (e.g. the daily tick vs a
 * return-to-foreground trigger landing milliseconds later) would both send the same token, and
 * since `refresh` revokes the request's own token, the second one 401s and — via `apiFetch`'s
 * 401 handling — can clear the first attempt's replacement before it's stored. Same-tab
 * serializing is enough here (this module is the only caller). Cross-tab overlaps remain
 * possible (all tabs read the same `window.localStorage` token), but they require two tabs to
 * independently schedule a rotation within the same instant — a millisecond-scale coincidence
 * on a once-per-24h action — and the interval-vs-visibility overlap this flag already closes
 * covers the realistic same-tab triggers. A cross-tab lock (e.g. Web Locks) plus a server-side
 * replay window are the complete fixes; both out of scope for this client-side first pass. */
let rotationInFlight = false;
/** In-memory fallback for the persisted rotation timestamp: `markRotation` records here first,
 * so a localStorage write failure (quota, privacy mode) still gates this session's subsequent
 * triggers instead of re-rotating on every one of them. */
let lastRotationInMemory = 0;

/** When the stored session was last rotated, or 0 for "never". A failed rotation deliberately
 * does not update this — the next trigger retries without waiting another full interval. */
function lastRotationAt(): number {
	if (lastRotationInMemory) return lastRotationInMemory;
	if (typeof window === 'undefined') return 0;
	const raw = window.localStorage.getItem(LAST_ROTATION_KEY);
	const parsed = raw ? Number(raw) : 0;
	return Number.isFinite(parsed) ? parsed : 0;
}

function markRotation(): void {
	lastRotationInMemory = Date.now();
	try {
		window.localStorage.setItem(LAST_ROTATION_KEY, String(lastRotationInMemory));
	} catch {
		// Persisted timestamp is best-effort (quota/privacy-mode failures shouldn't crash the
		// rotation that just succeeded); the in-memory value above still gates this session.
	}
}

/** True when a rotation is due — i.e. the stored session hasn't been rotated within the last
 * ROTATION_INTERVAL_MS. Deliberately NOT rotated synchronously on page load: the layout remounts
 * on every reload and SPA entry, and a rotation fired there races the page's own parallel data
 * fetches — refresh revokes the request's token, so fetches still in flight with the old one 401
 * and wipe the freshly-rotated session (observed live: every E2E reload logged the session out).
 * The startup check below is therefore deferred until mount-time traffic has settled. */
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
		//
		// A 401 from a *stale* in-flight request (sent with this same token before the rotation)
		// that lands between here and setToken is the residual race: with the startup rotation
		// deferred past mount-time traffic and the 24h gate, the only requests that can still be
		// holding this token are minutes-old ones, and `apiFetch`'s 401 handler only clears
		// storage when the stored token is still the one that 401'd — so after this rotation
		// stores the replacement, a straggler's 401 no longer clears anything.
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
 * Starts proactive session-token rotation: a due check shortly after startup (deferred past the
 * layout's mount-time data fetches, so the rotation can't revoke a token still in flight with
 * them), then a check on every daily interval tick, plus on every return-to-foreground (mobile
 * OSes suspend timers while backgrounded, so a device resuming after days asleep otherwise
 * wouldn't rotate until the next tick). All three are no-ops unless the stored session was last
 * rotated more than ROTATION_INTERVAL_MS ago. Call once, e.g. from the root layout; safe to call
 * from a server-rendering context (no-ops without `window`) and idempotent across remounts.
 *
 * Impersonation is deliberately left alone: the 1-hour impersonation token is intentionally
 * short-lived and `refresh` rejects it server-side, so its 401 is the expected lifecycle, not a
 * bug to paper over — and a rotation attempt is harmless anyway (it fails, nothing changes).
 */
export function startAuthRotation(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

	// setTimeout, not a bare call, so the due check fires after the layout's mount-time fetches
	// (a fresh page load fires several GETs in parallel) have completed — see STARTUP_SETTLE_MS.
	setTimeout(() => void rotateToken(), STARTUP_SETTLE_MS);
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
	lastRotationInMemory = 0;
	window.localStorage.removeItem(LAST_ROTATION_KEY);
}
