import { afterEach, describe, expect, it, vi } from 'vitest';

// client.ts's only dependency on storage is this module — faking it here
// keeps these tests focused on apiFetch's own logic (headers, envelope
// unwrapping, error handling) instead of the localStorage/SSR concerns
// that token.spec.ts and token.svelte.spec.ts already cover directly.
let fakeToken: string | null = null;
vi.mock('./token', () => ({
	getToken: () => fakeToken,
	setToken: (token: string) => {
		fakeToken = token;
	},
	clearToken: () => {
		fakeToken = null;
	}
}));

let fakeServerUrl = '';
vi.mock('./server-url', () => ({
	getServerUrl: () => fakeServerUrl
}));

const { apiDelete, apiFetch, apiGet, apiPatch, apiPost, ApiError } = await import('./client');
const { clearToken, getToken, setToken } = await import('./token');

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body)
	} as Response;
}

describe('apiFetch', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		clearToken();
	});

	it('attaches the bearer token when one is stored', async () => {
		setToken('secret-token');
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }));
		vi.stubGlobal('fetch', fetchMock);

		await apiFetch('/api/v1/whoami');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Headers).get('Authorization')).toBe('Bearer secret-token');
	});

	it('omits the Authorization header when there is no token', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiFetch('/api/v1/whoami');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Headers).has('Authorization')).toBe(false);
	});

	it('unwraps a { data } envelope', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { data: { id: 1 } })));

		await expect(apiFetch('/x')).resolves.toEqual({ id: 1 });
	});

	it('returns the body as-is when there is no { data } envelope', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { id: 1 })));

		await expect(apiFetch('/x')).resolves.toEqual({ id: 1 });
	});

	it('returns undefined for a 204 response without reading a body', async () => {
		const json = vi.fn();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({ ok: true, status: 204, json } as unknown as Response)
		);

		await expect(apiFetch('/x')).resolves.toBeUndefined();
		expect(json).not.toHaveBeenCalled();
	});

	it('throws an ApiError with the server message on failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(jsonResponse(422, { message: 'Name is required' }))
		);

		await expect(apiFetch('/x')).rejects.toMatchObject({
			status: 422,
			message: 'Name is required'
		});
	});

	it('falls back to the first validator error message', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(jsonResponse(422, { errors: [{ message: 'Invalid email' }] }))
		);

		await expect(apiFetch('/x')).rejects.toMatchObject({ message: 'Invalid email' });
	});

	it('falls back to the generic message when the errors array is empty', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { errors: [] })));

		await expect(apiFetch('/x')).rejects.toMatchObject({
			message: 'Request failed with status 500'
		});
	});

	it('falls back to a generic message when the error body is not JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.reject(new Error('not json'))
			} as unknown as Response)
		);

		await expect(apiFetch('/x')).rejects.toMatchObject({
			status: 500,
			message: 'Request failed with status 500'
		});
	});

	it('carries the parsed body on ApiError, for callers that need the conflicting row', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(jsonResponse(409, { data: { id: 1, version: 2 }, conflict: true }))
		);

		await expect(apiFetch('/x')).rejects.toMatchObject({
			status: 409,
			body: { data: { id: 1, version: 2 }, conflict: true }
		});
	});

	it('leaves the body undefined when the error response was not JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				json: () => Promise.reject(new Error('not json'))
			} as unknown as Response)
		);

		await expect(apiFetch('/x')).rejects.toMatchObject({ status: 500, body: undefined });
	});

	it('clears the stored token on a 401', async () => {
		setToken('stale-token');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }))
		);

		await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError);
		expect(getToken()).toBeNull();
	});
});

describe('apiFetch base URL prefixing', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		fakeServerUrl = '';
	});

	it('requests a bare relative path when no server URL is configured', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiFetch('/api/v1/lists');

		expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/lists');
	});

	it('prefixes the request with the configured server URL', async () => {
		fakeServerUrl = 'https://api.example.com';
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiFetch('/api/v1/lists');

		expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/v1/lists');
	});
});

describe('apiGet/apiPost/apiPatch/apiDelete', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('apiGet issues a GET with no body', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: [] }));
		vi.stubGlobal('fetch', fetchMock);

		await apiGet('/api/v1/lists');

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/v1/lists');
		expect(init.method).toBeUndefined();
		expect(init.body).toBeUndefined();
	});

	it('apiPost sends a JSON-encoded body and Content-Type header', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiPost('/api/v1/lists', { name: 'Groceries' });

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.method).toBe('POST');
		expect(init.body).toBe('{"name":"Groceries"}');
		expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
	});

	it('apiPost with no body omits Content-Type', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiPost('/api/v1/favorites/1/add-to-list/2');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.body).toBeUndefined();
		expect((init.headers as Headers).has('Content-Type')).toBe(false);
	});

	it('apiPatch sends a PATCH with a JSON body', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiPatch('/api/v1/lists/1', { archived: true });

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.method).toBe('PATCH');
		expect(init.body).toBe('{"archived":true}');
	});

	it('apiPatch with no body omits the body and Content-Type', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
		vi.stubGlobal('fetch', fetchMock);

		await apiPatch('/api/v1/lists/1');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.body).toBeUndefined();
		expect((init.headers as Headers).has('Content-Type')).toBe(false);
	});

	it('apiDelete sends a DELETE and resolves without a value', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: vi.fn() });
		vi.stubGlobal('fetch', fetchMock);

		await expect(apiDelete('/api/v1/lists/1')).resolves.toBeUndefined();
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.method).toBe('DELETE');
	});
});
