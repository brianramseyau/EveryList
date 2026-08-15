import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ logout: vi.fn() }));

const { goto } = await import('$app/navigation');
const { logout } = await import('$lib/api/auth');
const SettingsPage = (await import('./+page.svelte')).default;

describe('Settings +page.svelte', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('logs out and navigates to /login', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(logout).mockResolvedValue(undefined);
		vi.mocked(goto).mockResolvedValue(undefined);

		render(SettingsPage);

		await page.getByRole('button', { name: 'Log out' }).click();

		expect(logout).toHaveBeenCalled();
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows build metadata once /api/v1/meta resolves', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						version: 'v1.2.3',
						commit: 'abc123',
						builtAt: '2026-08-12T00:00:00.000Z'
					})
			})
		);

		render(SettingsPage);

		await expect.element(page.getByText(/EveryList v1\.2\.3 \(abc123\)/)).toBeInTheDocument();
	});

	it('shows a fallback message when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		await expect.element(page.getByText('EveryList — build info unavailable')).toBeInTheDocument();
	});

	it('switches the app theme preference and reflects the choice in the radio group', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		const darkOption = page.getByRole('radio', { name: 'Dark' });
		await expect.element(darkOption).toHaveAttribute('aria-checked', 'false');

		await darkOption.click();

		await expect.element(darkOption).toHaveAttribute('aria-checked', 'true');
		expect(window.localStorage.getItem('everylist:theme')).toBe('dark');

		window.localStorage.removeItem('everylist:theme');
		document.documentElement.classList.remove('dark');
	});

	it('switches the accent color preference and reflects the choice in the radio group', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		const forestOption = page.getByRole('radio', { name: 'Forest' });
		await expect.element(forestOption).toHaveAttribute('aria-checked', 'false');

		await forestOption.click();

		await expect.element(forestOption).toHaveAttribute('aria-checked', 'true');
		expect(window.localStorage.getItem('everylist:accent')).toBe('forest');
		expect(document.documentElement.getAttribute('data-accent')).toBe('forest');

		window.localStorage.removeItem('everylist:accent');
		document.documentElement.removeAttribute('data-accent');
	});

	it('switches the screen orientation preference and reflects the choice in the radio group', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		const lockSpy = vi.spyOn(screen.orientation, 'lock').mockResolvedValue(undefined);

		render(SettingsPage);

		const portraitOption = page.getByRole('radio', { name: 'Portrait' });
		await expect.element(portraitOption).toHaveAttribute('aria-checked', 'false');

		await portraitOption.click();

		await expect.element(portraitOption).toHaveAttribute('aria-checked', 'true');
		expect(window.localStorage.getItem('everylist:orientation')).toBe('portrait');
		await expect.poll(() => lockSpy.mock.calls.length).toBe(1);
		expect(lockSpy).toHaveBeenCalledWith('portrait');

		window.localStorage.removeItem('everylist:orientation');
		lockSpy.mockRestore();
	});

	it('shows an install hint when orientation locking is unavailable in a plain browser tab', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		await expect
			.element(
				page.getByText('Install EveryList to your home screen to lock orientation', {
					exact: false
				})
			)
			.toBeInTheDocument();
	});

	it('hides the install hint once running standalone (orientation locking is available)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		const matchMediaSpy = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);

		render(SettingsPage);

		await expect.element(page.getByText('Screen Orientation')).toBeInTheDocument();
		await expect
			.element(
				page.getByText('Install EveryList to your home screen to lock orientation', {
					exact: false
				})
			)
			.not.toBeInTheDocument();

		matchMediaSpy.mockRestore();
	});
});
