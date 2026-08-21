import { apiBaseUrl } from './base-url';
import { clearToken, getToken } from './token';

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
		if (response.status === 401) clearToken();
		const body = await parseErrorBody(response);
		throw new ApiError(response.status, extractErrorMessage(body, response.status), body);
	}

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
