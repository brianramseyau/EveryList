import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/debug', () => ({ fetchDebugInfo: vi.fn() }));

const { fetchDebugInfo } = await import('$lib/api/debug');
const { goto } = await import('$app/navigation');
const DebugPage = (await import('./+page.svelte')).default;

const debugInfo = {
	app: {
		version: '1.2.3',
		commit: 'abc123',
		builtAt: '2026-08-01T00:00:00.000Z',
		nodeEnv: 'production',
		appUrl: 'https://everylist.example.com'
	},
	runtime: {
		nodeVersion: 'v24.0.0',
		platform: 'linux',
		arch: 'x64',
		pid: 42,
		uptimeSeconds: 3600,
		memoryUsageMb: { rss: 120, heapTotal: 80, heapUsed: 60, external: 5 }
	},
	request: { hostHeader: 'everylist.example.com', protocol: 'https', ip: '192.0.2.1' },
	env: {
		NODE_ENV: 'production',
		APP_URL: 'https://everylist.example.com',
		SMTP2GO_HOST: null,
		SMTP2GO_PASSWORD: 'not set'
	}
};

describe('Debug +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(DebugPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('renders diagnostics on success', async () => {
		vi.mocked(fetchDebugInfo).mockResolvedValue(debugInfo);

		render(DebugPage);

		await expect.element(page.getByText('1.2.3')).toBeInTheDocument();
		await expect
			.element(page.getByText('everylist.example.com', { exact: true }))
			.toBeInTheDocument();
		await expect.element(page.getByText('(not set)')).toBeInTheDocument();
		await expect.element(page.getByText('not set', { exact: true })).toBeInTheDocument();
	});

	it('shows a forbidden message on a 403', async () => {
		vi.mocked(fetchDebugInfo).mockRejectedValue(new ApiError(403, 'Not authorized'));

		render(DebugPage);

		await expect
			.element(page.getByText("This page is only available to the instance's primary account."))
			.toBeInTheDocument();
	});

	it('shows the ApiError message for other failures', async () => {
		vi.mocked(fetchDebugInfo).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(DebugPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchDebugInfo).mockRejectedValue(new TypeError('network down'));

		render(DebugPage);

		await expect.element(page.getByText('Failed to load debug info.')).toBeInTheDocument();
	});
});
