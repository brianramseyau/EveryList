import { apiBaseUrl } from './base-url';
import { clearToken, getToken } from './token';
import { refreshWidget } from '../widget-refresh';

/**
 * Optional 401 coordinator, injected by auth-rotation.ts at startup (client.ts can't import
 * auth-rotation.ts directly — that module imports this one's apiPost, so a static import would
 * be circular). When set, a 401 whose request token is the one currently being rotated defers
 * its clear until the rotation settles (keeping a successful rotation's replacement, clearing
 * the old token on rotation failure); anything else falls through to this module's own
 * stored-token comparison. Untested builds (e.g. plain vitest unit runs without the layout's
 * startup call) and every pre-rotation flow simply run with the hook unset.
 */
let unauthorizedCoordinator: ((requestToken: string | null) => boolean | Promise<boolean>) | null =
	null;

/** Registers `fn` as the 401 coordinator — called once from auth-rotation.ts. Test-only
 * counterpart: {@link resetUnauthorizedCoordinatorForTesting}. */
export function setUnauthorizedCoordinator(
	fn: (requestToken: string | null) => boolean | Promise<boolean>
): void {
	unauthorizedCoordinator = fn;
}

/** Test-only: drops the coordinator registered by {@link setUnauthorizedCoordinator}. */
export function resetUnauthorizedCoordinatorForTesting(): void {
	unauthorizedCoordinator = null;
}

/** True when the coordinator (if any) approves the 401's clear — awaited, so the rotation's
 * settle step is the only thing that can hold it up. */
async function shouldClearOn401(requestToken: string | null): Promise<boolean> {
	if (!unauthorizedCoordinator) return true;
	return unauthorizedCoordinator(requestToken);
}

export class ApiError extends Error {
	status: number;
	/** The parsed JSON error body, when the response had one — a 409's `{ data, conflict: true }`
	 * carries the server's authoritative row, which the offline flush loop needs to reconcile. */
	body: unknown;

	constructor(status: number, message: string, body?: unknown) {
		super(message);
		this.status = status;
		this.body = body;
	}
}

/** True on a wrapper `{ data: T }` body — see apps/api's ApiSerializer. */
function unwrap<T>(body: unknown): T {
	if (body && typeof body === 'object' && 'data' in body) {
		return (body as { data: T }).data;
	}
	return body as T;
}

async function parseErrorBody(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		// Response body wasn't JSON.
		return undefined;
	}
}

function extractErrorMessage(body: unknown, status: number): string {
	if (body && typeof body === 'object') {
		const record = body as { message?: unknown; errors?: unknown };
		if (typeof record.message === 'string') return record.message;
		if (Array.isArray(record.errors) && typeof record.errors[0]?.message === 'string') {
			return record.errors[0].message;
		}
	}
	return `Request failed with status ${status}`;
}

/**
 * Thin fetch wrapper: attaches the bearer token, unwraps the `{ data }`
 * envelope, and normalizes failures into ApiError. On a 401 it also clears
 * the stored token, since that means it's no longer valid.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
	const token = getToken();
	const headers = new Headers(init.headers);
	headers.set('Accept', 'application/json');
	if (init.body !== undefined) headers.set('Content-Type', 'application/json');
	if (token) headers.set('Authorization', `Bearer ${token}`);

	const response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });

	if (!response.ok) {
		// A 401 means this request's token is no longer valid, but only clear storage when the
		// *stored* token is still the one this request was sent with — if a concurrent token
		// rotation (auth-rotation.ts) replaced it while this request was in flight, the
		// replacement is valid and must survive the stale request's 401.
		//
		// The coordinator adds one more guard on top: a 401 for the token *currently being
		// rotated* defers its clear until that rotation settles — otherwise a straggler's 401
		// arriving ahead of the rotation's own response would clear the old token (it still
		// matches storage at that instant) and the rotation would then discard its replacement
		// (getToken() no longer equals its request token), logging the user out. See
		// coordinate401WithRotation in auth-rotation.ts.
		if (response.status === 401 && getToken() === token && (await shouldClearOn401(token))) {
			clearToken();
		}
		const body = await parseErrorBody(response);
		throw new ApiError(response.status, extractErrorMessage(body, response.status), body);
	}

	// A write reached the server — let the home-screen widget pick it up (no-op off Android).
	if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) refreshWidget();

	if (response.status === 204) return undefined as T;

	const body = await response.json();
	return unwrap<T>(body);
}

export function apiGet<T>(path: string): Promise<T> {
	return apiFetch<T>(path);
}

export function apiPost<T>(path: string, json?: unknown): Promise<T> {
	return apiFetch<T>(path, {
		method: 'POST',
		body: json === undefined ? undefined : JSON.stringify(json)
	});
}

export function apiPatch<T>(path: string, json?: unknown): Promise<T> {
	return apiFetch<T>(path, {
		method: 'PATCH',
		body: json === undefined ? undefined : JSON.stringify(json)
	});
}

export function apiDelete(path: string): Promise<void> {
	return apiFetch<void>(path, { method: 'DELETE' });
}
