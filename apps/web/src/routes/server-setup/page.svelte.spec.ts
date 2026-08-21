import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/ping', () => ({ fetchPing: vi.fn() }));
vi.mock('$lib/api/server-url', () => ({ getServerUrl: vi.fn(), setServerUrl: vi.fn() }));

const { goto } = await import('$app/navigation');
const { fetchPing } = await import('$lib/api/ping');
const { getServerUrl, setServerUrl } = await import('$lib/api/server-url');

describe('Server setup +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(getServerUrl).mockReturnValue('');
	});

	afterEach(() => {
		vi.clearAllMocks();
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
});
