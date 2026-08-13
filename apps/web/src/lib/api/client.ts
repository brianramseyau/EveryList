import { clearToken, getToken } from './token';

export class ApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

/** True on a wrapper `{ data: T }` body — see apps/api's ApiSerializer. */
function unwrap<T>(body: unknown): T {
	if (body && typeof body === 'object' && 'data' in body) {
		return (body as { data: T }).data;
	}
	return body as T;
}

async function extractErrorMessage(response: Response): Promise<string> {
	try {
		const body = await response.json();
		if (typeof body?.message === 'string') return body.message;
		if (Array.isArray(body?.errors) && body.errors[0]?.message) return body.errors[0].message;
	} catch {
		// Response body wasn't JSON — fall through to the generic message.
	}
	return `Request failed with status ${response.status}`;
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

	const response = await fetch(path, { ...init, headers });

	if (!response.ok) {
		if (response.status === 401) clearToken();
		throw new ApiError(response.status, await extractErrorMessage(response));
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
