import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearToken, setToken } from './token';
import { ApiError } from './client';

// Runs in the "client" (real Chromium) project — downloadBackup touches
// document/URL.createObjectURL, which the "server" (node) project's env
// doesn't have. See backups.spec.ts for the plain GET/PATCH/POST wrappers.
const { downloadBackup } = await import('./backups');

describe('downloadBackup (browser)', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		clearToken();
	});

	it('fetches the file with the bearer token and clicks a throwaway link to save it', async () => {
		setToken('secret-token');
		const blob = new Blob(['sqlite bytes']);
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
		vi.stubGlobal('fetch', fetchMock);
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		await downloadBackup('everylist-manual-20260822-090000.sqlite3');

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain(
			'/api/v1/backup-settings/download/everylist-manual-20260822-090000.sqlite3'
		);
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
		expect(clickSpy).toHaveBeenCalledOnce();
	});

	it('omits the Authorization header when there is no stored token', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob()) });
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

		await downloadBackup('everylist-manual-20260822-090000.sqlite3');

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toEqual({});
	});

	it('throws an ApiError when the download fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

		await expect(downloadBackup('everylist-manual-20260822-090000.sqlite3')).rejects.toThrow(
			ApiError
		);
	});
});
