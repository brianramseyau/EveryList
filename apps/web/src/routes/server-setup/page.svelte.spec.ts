import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/ping', () => ({ fetchPing: vi.fn() }));
vi.mock('$lib/api/server-url', () => ({ getServerUrl: vi.fn(), setServerUrl: vi.fn() }));
vi.mock('$lib/platform/desktop', () => ({ isDesktop: vi.fn() }));

const { goto } = await import('$app/navigation');
const { fetchPing } = await import('$lib/api/ping');
const { getServerUrl, setServerUrl } = await import('$lib/api/server-url');
const { isDesktop } = await import('$lib/platform/desktop');

describe('Server setup +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(getServerUrl).mockReturnValue('');
		vi.mocked(isDesktop).mockReturnValue(false);
	});

	afterEach(() => {
		vi.clearAllMocks();
		delete window.everylistDesktop;
	});

	async function renderPage() {
		const ServerSetupPage = (await import('./+page.svelte')).default;
		render(ServerSetupPage);
	}

	it('pre-fills the input from the already-configured server URL', async () => {
		vi.mocked(getServerUrl).mockReturnValue('https://old.example.com');

		await renderPage();

		await expect.element(page.getByLabelText('Server URL')).toHaveValue('https://old.example.com');
	});

	it('saves and navigates to /login when the server is reachable', async () => {
		vi.mocked(fetchPing).mockResolvedValue(true);

		await renderPage();
		await page.getByLabelText('Server URL').fill('https://everylist.example.com');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();

		await expect.poll(() => vi.mocked(setServerUrl).mock.calls.length).toBe(1);
		expect(setServerUrl).toHaveBeenCalledWith('https://everylist.example.com');
		expect(fetchPing).toHaveBeenCalledWith('https://everylist.example.com');
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('rejects a malformed URL without pinging or saving', async () => {
		await renderPage();
		await page.getByLabelText('Server URL').fill('not-a-url');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();

		await expect
			.element(page.getByText('Enter a valid server URL, e.g. https://everylist.example.com'))
			.toBeInTheDocument();
		expect(fetchPing).not.toHaveBeenCalled();
		expect(setServerUrl).not.toHaveBeenCalled();
	});

	it('rejects a non-http(s) URL', async () => {
		await renderPage();
		await page.getByLabelText('Server URL').fill('ftp://example.com');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();

		await expect
			.element(page.getByText('Enter a valid server URL, e.g. https://everylist.example.com'))
			.toBeInTheDocument();
		expect(fetchPing).not.toHaveBeenCalled();
	});

	it('shows an unreachable warning and offers to continue anyway', async () => {
		vi.mocked(fetchPing).mockResolvedValue(false);

		await renderPage();
		await page.getByLabelText('Server URL').fill('https://down.example.com');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();

		await expect
			.element(page.getByText("Couldn't reach this server.", { exact: false }))
			.toBeInTheDocument();
		expect(setServerUrl).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Continue anyway' }).click();

		await expect.poll(() => vi.mocked(setServerUrl).mock.calls.length).toBe(1);
		expect(setServerUrl).toHaveBeenCalledWith('https://down.example.com');
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('re-checking after fixing the URL clears the unreachable warning', async () => {
		vi.mocked(fetchPing).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		await renderPage();
		await page.getByLabelText('Server URL').fill('https://down.example.com');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();
		await expect
			.element(page.getByText("Couldn't reach this server.", { exact: false }))
			.toBeInTheDocument();

		await page.getByLabelText('Server URL').fill('https://up.example.com');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('does not offer standalone mode outside the desktop build', async () => {
		vi.mocked(isDesktop).mockReturnValue(false);

		await renderPage();

		expect(page.getByText('Use EveryList on this device only').elements()).toHaveLength(0);
	});

	it('does not offer standalone mode when a server is already configured (change-server reentry)', async () => {
		// Settings → Server → "Change" clears the URL before returning here, but this install's
		// mode was already explicitly recorded as 'remote' — the URL being empty here must not,
		// on its own, resurface the standalone option to an established remote install.
		vi.mocked(isDesktop).mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('');
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			mode: 'remote',
			checkForUpdate: vi.fn(),
			setBackgroundRun: vi.fn(),
			enableStandalone: vi.fn(),
			recordRemoteMode: vi.fn(),
			consumeStandaloneToken: vi.fn()
		};

		await renderPage();

		expect(page.getByText('Use EveryList on this device only').elements()).toHaveLength(0);
	});

	it('switches into standalone mode on the desktop build on first run (mode not yet recorded)', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		const enableStandalone = vi.fn().mockResolvedValue({ port: 41790 });
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			mode: null,
			checkForUpdate: vi.fn(),
			setBackgroundRun: vi.fn(),
			enableStandalone,
			recordRemoteMode: vi.fn(),
			consumeStandaloneToken: vi.fn()
		};

		await renderPage();
		await page.getByRole('button', { name: 'Use EveryList on this device only' }).click();

		await expect.poll(() => enableStandalone.mock.calls.length).toBe(1);
	});

	it('shows the underlying error detail and re-enables the button when standalone mode fails to start', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		// main.cjs's enableStandaloneOnce throws specific, actionable messages — verifying one of
		// them reaches the UI (not just a generic "try again", which is actively wrong for cases
		// like this one) is the whole point of this test.
		const enableStandalone = vi
			.fn()
			.mockRejectedValue(
				new Error(
					"Error invoking remote method 'everylist:enable-standalone': Error: An owner account already exists for this standalone instance, but no readable saved credentials were found to sign back in with. Retrying will not help."
				)
			);
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			mode: null,
			checkForUpdate: vi.fn(),
			setBackgroundRun: vi.fn(),
			enableStandalone,
			recordRemoteMode: vi.fn(),
			consumeStandaloneToken: vi.fn()
		};

		await renderPage();
		await page.getByRole('button', { name: 'Use EveryList on this device only' }).click();

		await expect
			.element(
				page.getByText('An owner account already exists for this standalone instance', {
					exact: false
				})
			)
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Use EveryList on this device only' }))
			.toBeEnabled();
	});

	it('falls back to a generic message when the rejection has no usable detail', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		const enableStandalone = vi.fn().mockRejectedValue('not an Error instance');
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			mode: null,
			checkForUpdate: vi.fn(),
			setBackgroundRun: vi.fn(),
			enableStandalone,
			recordRemoteMode: vi.fn(),
			consumeStandaloneToken: vi.fn()
		};

		await renderPage();
		await page.getByRole('button', { name: 'Use EveryList on this device only' }).click();

		await expect
			.element(page.getByText("Couldn't start the local server. Try again", { exact: false }))
			.toBeInTheDocument();
	});

	it('records remote mode once a server is saved from the desktop build', async () => {
		vi.mocked(isDesktop).mockReturnValue(true);
		vi.mocked(fetchPing).mockResolvedValue(true);
		const recordRemoteMode = vi.fn().mockResolvedValue(undefined);
		window.everylistDesktop = {
			version: '1.0.0',
			platform: 'darwin',
			mode: null,
			checkForUpdate: vi.fn(),
			setBackgroundRun: vi.fn(),
			enableStandalone: vi.fn(),
			recordRemoteMode,
			consumeStandaloneToken: vi.fn()
		};

		await renderPage();
		await page.getByLabelText('Server URL').fill('https://everylist.example.com');
		await page.getByRole('button', { name: 'Continue', exact: true }).click();

		await expect.poll(() => recordRemoteMode.mock.calls.length).toBe(1);
	});
});
