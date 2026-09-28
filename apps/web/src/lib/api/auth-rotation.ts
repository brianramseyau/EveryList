import { apiFetch, setUnauthorizedCoordinator } from './client';
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

// Registered unconditionally at import time (not inside startAuthRotation): a rotation can be
// triggered by any rotateToken() call site, and a straggler 401 racing it must be coordinated
// regardless of whether the layout's startup hook ran. The registration is idempotent and
// harmless when no rotation ever fires — the coordinator only defers a 401 while this module
// actually has a rotation in flight (rotatingToken set), otherwise it defers straight back to
// apiFetch's own comparison.
setUnauthorizedCoordinator(coordinate401WithRotation);

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
/** The token the in-flight rotation was sent with (null when none is) — `apiFetch`'s 401 handler
 *  consults this so a straggler's 401 can't clear the token out from under the rotation. See
 *  {@link coordinate401WithRotation}. */
let rotatingToken: string | null = null;
/** Resolvers for 401s that arrived while a rotation of the same token was in flight — each is
 *  called with the rotation's outcome (true = replacement stored, false = rotation failed) so
 *  the 401 handler can clear-or-keep accordingly. */
const pending401Decisions: Array<(cleared: boolean) => void> = [];
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
	rotatingToken = requestToken;
	try {
		// Deliberately NOT apiPost: this request is the rotation itself, and its 401 (an
		// expired/revoked token) must never park on its own coordination — that would
		// deadlock (the refresh's 401 would wait for the very rotation awaiting this
		// response). The bypass drops it straight into apiFetch's plain stored-token
		// comparison, which clears the dead old token directly; rotateToken's catch then
		// treats it like any other failure and the parked straggler 401s resolve "failed".
		const response = await apiFetch<AuthResponse>(
			'/api/v1/account/refresh',
			{ method: 'POST' },
			{ bypass401Coordinator: true }
		);
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
		// Release this rotation's 401 coordination *before* clearing the in-flight flag, so a
		// 401 that arrives the instant after sees no rotation in flight and follows its own
		// plain path (by then the stored token is either the replacement — which no longer
		// matches the straggler's old token, so nothing is cleared — or something else the
		// user did, which the plain comparison handles correctly anyway).
		const settled = pending401Decisions.splice(0);
		pending401Decisions.length = 0;
		const success = getToken() !== requestToken; // replacement stored by this very request
		for (const resolve of settled) resolve(!success);
		rotatingToken = null;
		rotationInFlight = false;
	}
}

/**
 * Coordinates `apiFetch`'s 401 handling with an in-flight rotation of the same token.
 *
 * The race this closes: the refresh endpoint revokes the request's own token server-side before
 * it returns the replacement, so a request that was already in flight with the old token can
 * receive its 401 *before* the rotation's response lands. Without coordination, that 401 would
 * see "stored token is still the one I sent" and clear it — and `rotateToken` would then discard
 * its replacement (`getToken() !== requestToken`), logging the user out entirely.
 *
 * So when a 401 arrives for the token currently being rotated, the clear is deferred until the
 * rotation settles: on success the replacement is kept (the stale request's 401 is ignored —
 * its token is gone by design, the session continues with the new one); on failure the old
 * token is cleared, exactly as the plain 401 path would have. Everything else — a 401 for a
 * token that isn't being rotated, or no rotation in flight — defers to `apiFetch`'s own
 * stored-token comparison, unchanged.
 *
 * The rotation's own refresh request bypasses this coordinator entirely (apiFetch's
 * `bypass401Coordinator` option, set in `rotateToken`) — its 401 is that dead token's plain
 * expiry path and must never park on the coordination state of the very rotation awaiting that
 * response, which would deadlock both sides.
 *
 * @returns true when the caller should proceed with its normal clear (either no coordination
 * applied, or the rotation failed and the old token is indeed dead), false when the rotation
 * succeeded and the caller must leave storage alone.
 */
export function coordinate401WithRotation(requestToken: string | null): boolean | Promise<boolean> {
	const stored = getToken();
	// A 401 for a token other than the stored one is stale regardless of any rotation — the
	// caller's own comparison already handles that (it clears nothing).
	if (requestToken === null || stored !== requestToken) return true;
	// No rotation of this token in flight — the caller's own comparison is authoritative.
	if (rotatingToken === null || rotatingToken !== requestToken) return true;
	// The exact race: this 401 is for the token being rotated right now. The rotation will
	// either store a replacement (keep it) or fail (the old token is really dead — clear it).
	return new Promise<boolean>((resolve) => {
		pending401Decisions.push(resolve);
	}).then((failed) => failed);
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
	rotatingToken = null;
	pending401Decisions.length = 0;
	lastRotationInMemory = 0;
	window.localStorage.removeItem(LAST_ROTATION_KEY);
}
