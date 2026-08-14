import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$lib/pwa/install-prompt', () => ({
	hasDeferredInstallPrompt: vi.fn(),
	isIOSSafari: vi.fn(),
	isStandalone: vi.fn(),
	onInstallAvailabilityChange: vi.fn(),
	promptInstall: vi.fn()
}));

const {
	hasDeferredInstallPrompt,
	isIOSSafari,
	isStandalone,
	onInstallAvailabilityChange,
	promptInstall
} = await import('$lib/pwa/install-prompt');
const { default: InstallPrompt } = await import('./InstallPrompt.svelte');

afterEach(() => {
	vi.clearAllMocks();
});

describe('InstallPrompt.svelte', () => {
	it('renders nothing when already running standalone', async () => {
		vi.mocked(isStandalone).mockReturnValue(true);
		vi.mocked(hasDeferredInstallPrompt).mockReturnValue(true);
		vi.mocked(isIOSSafari).mockReturnValue(false);

		render(InstallPrompt);

		await expect.element(page.getByRole('button', { name: 'Install' })).not.toBeInTheDocument();
	});

	it('renders nothing on a browser with neither a captured prompt nor iOS Safari', async () => {
		vi.mocked(isStandalone).mockReturnValue(false);
		vi.mocked(hasDeferredInstallPrompt).mockReturnValue(false);
		vi.mocked(isIOSSafari).mockReturnValue(false);

		render(InstallPrompt);

		await expect.element(page.getByRole('button', { name: 'Install' })).not.toBeInTheDocument();
		await expect
			.element(page.getByText('Add to Home Screen', { exact: false }))
			.not.toBeInTheDocument();
	});

	it('shows an install button when a prompt is already available on mount', async () => {
		vi.mocked(isStandalone).mockReturnValue(false);
		vi.mocked(hasDeferredInstallPrompt).mockReturnValue(true);
		vi.mocked(isIOSSafari).mockReturnValue(false);
		vi.mocked(promptInstall).mockResolvedValue(undefined);

		render(InstallPrompt);
		await expect.element(page.getByRole('button', { name: 'Install' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Install' }).click();

		expect(promptInstall).toHaveBeenCalled();
	});

	it('reacts to a prompt becoming available later via onInstallAvailabilityChange', async () => {
		vi.mocked(isStandalone).mockReturnValue(false);
		vi.mocked(hasDeferredInstallPrompt).mockReturnValue(false);
		vi.mocked(isIOSSafari).mockReturnValue(false);
		const captured: { notify: ((available: boolean) => void) | null } = { notify: null };
		vi.mocked(onInstallAvailabilityChange).mockImplementation((listener) => {
			captured.notify = listener;
		});

		render(InstallPrompt);
		await expect.element(page.getByRole('button', { name: 'Install' })).not.toBeInTheDocument();

		captured.notify?.(true);
		await expect.element(page.getByRole('button', { name: 'Install' })).toBeInTheDocument();
	});

	it('hides the button again once the prompt is consumed and none remains', async () => {
		vi.mocked(isStandalone).mockReturnValue(false);
		vi.mocked(hasDeferredInstallPrompt).mockReturnValueOnce(true).mockReturnValue(false);
		vi.mocked(isIOSSafari).mockReturnValue(false);
		vi.mocked(promptInstall).mockResolvedValue(undefined);

		render(InstallPrompt);
		await expect.element(page.getByRole('button', { name: 'Install' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Install' }).click();

		await expect.element(page.getByRole('button', { name: 'Install' })).not.toBeInTheDocument();
	});

	it('shows the iOS Safari hint when no beforeinstallprompt is available', async () => {
		vi.mocked(isStandalone).mockReturnValue(false);
		vi.mocked(hasDeferredInstallPrompt).mockReturnValue(false);
		vi.mocked(isIOSSafari).mockReturnValue(true);

		render(InstallPrompt);

		await expect
			.element(page.getByText('Add to Home Screen', { exact: false }))
			.toBeInTheDocument();
	});
});
