import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import {
	resetConnectivityForTesting,
	setServerUnavailableForTesting
} from '$lib/offline/connectivity.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({
	logout: vi.fn(),
	fetchProfile: vi.fn(),
	updateProfile: vi.fn()
}));
vi.mock('$lib/pwa/reset', () => ({ resetApp: vi.fn() }));
vi.mock('$lib/pwa/update', () => ({ checkForUpdate: vi.fn() }));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn().mockReturnValue(false) }
}));
vi.mock('@capacitor/app', () => ({
	App: { getInfo: vi.fn().mockRejectedValue(new Error('web')) }
}));
vi.mock('@capacitor/screen-orientation', () => ({
	ScreenOrientation: { lock: vi.fn(), unlock: vi.fn() }
}));
vi.mock('$lib/api/server-url', () => ({
	getServerUrl: vi.fn().mockReturnValue(''),
	clearServerUrl: vi.fn()
}));

const { goto } = await import('$app/navigation');
const { logout, fetchProfile, updateProfile } = await import('$lib/api/auth');
const { resetApp } = await import('$lib/pwa/reset');
const { checkForUpdate } = await import('$lib/pwa/update');
const { ApiError } = await import('$lib/api/client');
const { Capacitor } = await import('@capacitor/core');
const { App } = await import('@capacitor/app');
const { getServerUrl, clearServerUrl } = await import('$lib/api/server-url');
const { getToken, setToken } = await import('$lib/api/token');
const SettingsPage = (await import('./+page.svelte')).default;

const profile = {
	id: 1,
	fullName: 'Ada Lovelace',
	email: 'ada@example.com',
	createdAt: '2026-08-01T00:00:00.000Z',
	updatedAt: null,
	initials: 'AL'
};

describe('Settings +page.svelte', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
		vi.mocked(App.getInfo).mockRejectedValue(new Error('web'));
		vi.mocked(getServerUrl).mockReturnValue('');
		resetConnectivityForTesting();
	});

	it('sets the document title', async () => {
		render(SettingsPage);

		await expect.poll(() => document.title).toBe('Settings — EveryList');
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

		await expect.element(page.getByText(/Server v1\.2\.3 \(abc123\)/)).toBeInTheDocument();
	});

	it('shows the native app version alongside the server version for comparison', async () => {
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
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(App.getInfo).mockResolvedValue({
			name: 'EveryList',
			id: 'au.brianramsey.everylist',
			build: '42',
			version: '1.4.0'
		});

		render(SettingsPage);

		await expect.element(page.getByText(/App 1\.4\.0 \(42\)/)).toBeInTheDocument();
		await expect.element(page.getByText(/Server v1\.2\.3 \(abc123\)/)).toBeInTheDocument();
	});

	it('shows a fallback message when the request fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		await expect.element(page.getByText('EveryList — build info unavailable')).toBeInTheDocument();
	});

	it('links to the sync status page', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		await expect.element(page.getByRole('link', { name: 'Sync status' })).toBeInTheDocument();
	});

	it('surfaces a server-unavailable hint on the sync status link', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		setServerUnavailableForTesting(true);

		render(SettingsPage);

		await expect.element(page.getByText('Server unavailable')).toBeInTheDocument();
	});

	it("links to the debug page for the instance's primary account (user id 1)", async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);

		render(SettingsPage);

		await expect.element(page.getByRole('link', { name: 'Debug info' })).toBeInTheDocument();
	});

	it('hides the debug link for any other account', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue({ ...profile, id: 2 });

		render(SettingsPage);
		await expect.element(page.getByText('Reset app')).toBeInTheDocument();

		await expect.element(page.getByRole('link', { name: 'Debug info' })).not.toBeInTheDocument();
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
		const matchMediaSpy = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);
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
		matchMediaSpy.mockRestore();
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

		// Picking an orientation in a plain tab stays silent — the install hint
		// above already explains the remedy; don't double up with the guidance note.
		await page.getByRole('radio', { name: 'Portrait' }).click();
		await expect.element(page.getByText(/Auto-rotate/)).not.toBeInTheDocument();
	});

	it('shows an auto-rotate guidance note when a standalone PWA lock is rejected', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		const matchMediaSpy = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);
		vi.spyOn(screen.orientation, 'lock').mockRejectedValue(new Error('NotSupportedError'));

		render(SettingsPage);

		await page.getByRole('radio', { name: 'Portrait' }).click();

		await expect.element(page.getByText(/Auto-rotate/)).toBeInTheDocument();
		matchMediaSpy.mockRestore();
	});

	it('shows a not-supported note when the lock API is absent even standalone (e.g. iOS PWA)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		const matchMediaSpy = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);
		vi.stubGlobal('screen', { orientation: { type: 'landscape-primary', angle: 0 } });

		render(SettingsPage);

		await page.getByRole('radio', { name: 'Landscape' }).click();

		await expect
			.element(
				page.getByText("Screen orientation lock isn't supported in this browser", {
					exact: false
				})
			)
			.toBeInTheDocument();
		matchMediaSpy.mockRestore();
	});

	it('shows a note when the native orientation lock fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		const { ScreenOrientation } = await import('@capacitor/screen-orientation');
		vi.mocked(ScreenOrientation.lock).mockRejectedValue(new Error('not available'));

		render(SettingsPage);

		await page.getByRole('radio', { name: 'Portrait' }).click();

		await expect.element(page.getByText(/This device didn't allow locking/)).toBeInTheDocument();
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

	it('shows a not-supported note when the Screen Orientation lock API is absent (e.g. Safari)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.stubGlobal('screen', { orientation: { type: 'landscape-primary', angle: 0 } });

		render(SettingsPage);

		await expect.element(page.getByText('Screen Orientation', { exact: true })).toBeInTheDocument();
		await expect
			.element(
				page.getByText("Screen orientation lock isn't supported in this browser", {
					exact: false
				})
			)
			.toBeInTheDocument();
	});

	it('clears cached app data via the Reset app button', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		let resolveReset!: () => void;
		vi.mocked(resetApp).mockReturnValue(
			new Promise((resolve) => {
				resolveReset = resolve;
			})
		);

		render(SettingsPage);

		const resetButton = page.getByRole('button', { name: 'Reset app' });
		await resetButton.click();

		expect(resetApp).toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: 'Resetting…' })).toBeDisabled();

		resolveReset();
	});

	it('shows "up to date" after a check finds no new version', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(checkForUpdate).mockResolvedValue('up-to-date');

		render(SettingsPage);

		const checkButton = page.getByRole('button', { name: 'Check for update' });
		await checkButton.click();

		expect(checkForUpdate).toHaveBeenCalled();
		await expect.element(page.getByText("You're on the latest version.")).toBeInTheDocument();
	});

	it('shows an unavailable message when the update check cannot run', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(checkForUpdate).mockResolvedValue('unavailable');

		render(SettingsPage);

		const checkButton = page.getByRole('button', { name: 'Check for update' });
		await checkButton.click();

		expect(checkForUpdate).toHaveBeenCalled();
		await expect
			.element(page.getByText('Update check unavailable right now — try again in a moment.'))
			.toBeInTheDocument();
	});

	it('leaves the "Checking…" button disabled while an update is found and applied', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		let resolveCheck!: (result: 'updating') => void;
		vi.mocked(checkForUpdate).mockReturnValue(
			new Promise((resolve) => {
				resolveCheck = resolve;
			})
		);

		render(SettingsPage);

		const checkButton = page.getByRole('button', { name: 'Check for update' });
		await checkButton.click();

		await expect.element(page.getByRole('button', { name: 'Checking…' })).toBeDisabled();

		resolveCheck('updating');
	});

	it('shows the signed-in account email and current name as text with an edit button', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);

		render(SettingsPage);

		await expect.element(page.getByText('ada@example.com')).toBeInTheDocument();
		await expect.element(page.getByText('Ada Lovelace')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Edit name' })).toBeInTheDocument();
	});

	it('shows a placeholder when the account has no name', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue({ ...profile, fullName: null });

		render(SettingsPage);

		await expect.element(page.getByText('Add your name')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Edit name' }).click();
		await expect.element(page.getByRole('textbox')).toHaveValue('');
	});

	it('swaps the name text for an input when the edit button is clicked', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();

		await expect.element(page.getByRole('textbox')).toHaveValue('Ada Lovelace');
	});

	it('saves the edited name when the field loses focus', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);
		vi.mocked(updateProfile).mockResolvedValue({ ...profile, fullName: 'Ada King' });

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();
		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(updateProfile).mock.calls.length).toBe(1);
		expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Ada King' });
	});

	it('shows the updated name as text once editing completes', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);
		vi.mocked(updateProfile).mockResolvedValue({ ...profile, fullName: 'Ada King' });

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();
		const nameInput = page.getByRole('textbox');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.element(page.getByText('Ada King')).toBeInTheDocument();
		await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
	});

	it('does not save on blur when the name was not changed', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();
		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		nameInput.element().focus();
		nameInput.element().blur();

		expect(updateProfile).not.toHaveBeenCalled();
	});

	it('clears the name to null when the field is blanked out', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);
		vi.mocked(updateProfile).mockResolvedValue({ ...profile, fullName: null });

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();
		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(updateProfile).mock.calls.length).toBe(1);
		expect(updateProfile).toHaveBeenCalledWith({ fullName: null });
	});

	it('shows an error and keeps editing when saving the name fails', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);
		vi.mocked(updateProfile).mockRejectedValue(new Error('network error'));

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();
		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.element(page.getByText('Failed to save name.')).toBeInTheDocument();
		await expect.element(page.getByRole('textbox')).toBeInTheDocument();
	});

	it('shows a fallback message when the profile fails to load', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockRejectedValue(new Error('network error'));

		render(SettingsPage);

		await expect.element(page.getByText('Failed to load account.')).toBeInTheDocument();
	});

	it('shows the server message when the profile fails to load with an ApiError', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockRejectedValue(new ApiError(500, 'Account unavailable.'));

		render(SettingsPage);

		await expect.element(page.getByText('Account unavailable.')).toBeInTheDocument();
	});

	it('shows the server message when saving the name fails with an ApiError', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);
		vi.mocked(updateProfile).mockRejectedValue(new ApiError(422, 'Name is invalid.'));

		render(SettingsPage);

		await page.getByRole('button', { name: 'Edit name' }).click();
		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.element(page.getByText('Name is invalid.')).toBeInTheDocument();
	});

	it('does not show a Server section on the web/PWA build', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

		render(SettingsPage);

		await expect.element(page.getByText('Server')).not.toBeInTheDocument();
	});

	it('does not show the Troubleshooting section on native builds', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

		render(SettingsPage);

		await expect.element(page.getByText('Troubleshooting')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Reset app' })).not.toBeInTheDocument();
	});

	it('shows the configured server URL and changing it clears the token, server URL, and navigates', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		vi.mocked(getServerUrl).mockReturnValue('https://everylist.example.com');
		vi.mocked(goto).mockResolvedValue(undefined);
		setToken('a-token');

		render(SettingsPage);

		await expect.element(page.getByText('https://everylist.example.com')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Change' }).click();

		expect(clearServerUrl).toHaveBeenCalled();
		expect(getToken()).toBeNull();
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/server-setup');
	});
});
