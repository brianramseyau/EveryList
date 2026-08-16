import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({
	logout: vi.fn(),
	fetchProfile: vi.fn(),
	updateProfile: vi.fn()
}));
vi.mock('$lib/pwa/reset', () => ({ resetApp: vi.fn() }));

const { goto } = await import('$app/navigation');
const { logout, fetchProfile, updateProfile } = await import('$lib/api/auth');
const { resetApp } = await import('$lib/pwa/reset');
const { ApiError } = await import('$lib/api/client');
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

	it('shows the signed-in account email and current name once the profile loads', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);

		render(SettingsPage);

		await expect.element(page.getByText('ada@example.com')).toBeInTheDocument();
		await expect.element(page.getByRole('textbox')).toHaveValue('Ada Lovelace');
	});

	it('saves the edited name when the field loses focus', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);
		vi.mocked(updateProfile).mockResolvedValue({ ...profile, fullName: 'Ada King' });

		render(SettingsPage);

		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.poll(() => vi.mocked(updateProfile).mock.calls.length).toBe(1);
		expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Ada King' });
	});

	it('does not save on blur when the name was not changed', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
		vi.mocked(fetchProfile).mockResolvedValue(profile);

		render(SettingsPage);

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

		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.element(page.getByText('Failed to save name.')).toBeInTheDocument();
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

		const nameInput = page.getByRole('textbox');
		await expect.element(nameInput).toHaveValue('Ada Lovelace');
		await nameInput.fill('Ada King');
		nameInput.element().blur();

		await expect.element(page.getByText('Name is invalid.')).toBeInTheDocument();
	});
});
