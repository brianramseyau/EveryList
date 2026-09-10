import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/setup', () => ({ fetchSetupStatus: vi.fn(), completeSetup: vi.fn() }));

const { goto } = await import('$app/navigation');
const { fetchSetupStatus, completeSetup } = await import('$lib/api/setup');
const SetupPage = (await import('./+page.svelte')).default;

const status = {
	needsSetup: true,
	defaultBackupSettings: { frequency: 'weekly' as const, timeOfDay: '03:00', retentionCount: 4 }
};

async function fillAccountStep() {
	await page.getByLabelText('Email').fill('owner@example.com');
	await page.getByLabelText('Password', { exact: true }).fill('password123');
	await page.getByLabelText('Confirm password').fill('password123');
	await page.getByRole('button', { name: 'Continue' }).click();
}

describe('Setup +page.svelte', () => {
	beforeEach(() => {
		vi.mocked(goto).mockResolvedValue(undefined);
		vi.mocked(fetchSetupStatus).mockResolvedValue(status);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('redirects to /login when setup is already done', async () => {
		vi.mocked(fetchSetupStatus).mockResolvedValue({ ...status, needsSetup: false });

		render(SetupPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/login', { replaceState: true });
	});

	it('renders the wizard when setup is needed', async () => {
		render(SetupPage);

		await expect.element(page.getByLabelText('Email')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('renders the wizard when the status fetch fails (fails open)', async () => {
		vi.mocked(fetchSetupStatus).mockRejectedValue(new Error('network down'));

		render(SetupPage);

		await expect.element(page.getByLabelText('Email')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('pre-fills the backup step from the server defaults', async () => {
		vi.mocked(fetchSetupStatus).mockResolvedValue({
			needsSetup: true,
			defaultBackupSettings: { frequency: 'monthly', timeOfDay: '02:15', retentionCount: 6 }
		});

		render(SetupPage);
		await fillAccountStep();

		await expect.element(page.getByLabelText('Frequency')).toHaveValue('monthly');
		await expect.element(page.getByLabelText('Time of day')).toHaveValue('02:15');
		await expect.element(page.getByLabelText('Backups to keep')).toHaveValue(6);
	});

	it('goes back from the backup step to the account step', async () => {
		render(SetupPage);
		await fillAccountStep();

		await expect.element(page.getByLabelText('Frequency')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Back' }).click();

		await expect.element(page.getByLabelText('Email')).toHaveValue('owner@example.com');
	});

	it('allows editing the backup step fields before finishing', async () => {
		vi.mocked(completeSetup).mockResolvedValue({
			user: {
				id: 1,
				fullName: null,
				email: 'owner@example.com',
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				initials: 'O'
			},
			token: 'tok',
			backup: { frequency: 'daily', timeOfDay: '04:30', retentionCount: 10 }
		});

		render(SetupPage);
		await page.getByLabelText('Name (optional)').fill('Ada Lovelace');
		await fillAccountStep();

		await page.getByLabelText('Frequency').selectOptions('daily');
		await page.getByLabelText('Time of day').fill('04:30');
		await page.getByLabelText('Backups to keep').fill('10');
		await page.getByRole('button', { name: 'Finish setup' }).click();

		await expect.poll(() => vi.mocked(completeSetup).mock.calls.length).toBe(1);
		expect(completeSetup).toHaveBeenCalledWith(
			expect.objectContaining({
				backup: { frequency: 'daily', timeOfDay: '04:30', retentionCount: 10 }
			})
		);
	});

	it('completes setup and navigates to /lists', async () => {
		vi.mocked(completeSetup).mockResolvedValue({
			user: {
				id: 1,
				fullName: null,
				email: 'owner@example.com',
				createdAt: '2026-08-01T00:00:00.000Z',
				updatedAt: null,
				initials: 'O'
			},
			token: 'tok',
			backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 }
		});

		render(SetupPage);
		await fillAccountStep();
		await page.getByRole('button', { name: 'Finish setup' }).click();

		await expect.poll(() => vi.mocked(completeSetup).mock.calls.length).toBe(1);
		expect(completeSetup).toHaveBeenCalledWith({
			fullName: null,
			email: 'owner@example.com',
			password: 'password123',
			passwordConfirmation: 'password123',
			backup: { frequency: 'weekly', timeOfDay: '03:00', retentionCount: 4 }
		});
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(goto).toHaveBeenCalledWith('/lists');
	});

	it('shows the API error message on failure', async () => {
		vi.mocked(completeSetup).mockRejectedValue(
			new ApiError(409, 'Setup has already been completed')
		);

		render(SetupPage);
		await fillAccountStep();
		await page.getByRole('button', { name: 'Finish setup' }).click();

		await expect.element(page.getByText('Setup has already been completed')).toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});

	it('shows a generic error message on failure without an ApiError', async () => {
		vi.mocked(completeSetup).mockRejectedValue(new TypeError('network down'));

		render(SetupPage);
		await fillAccountStep();
		await page.getByRole('button', { name: 'Finish setup' }).click();

		await expect
			.element(page.getByText('Something went wrong. Please try again.'))
			.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
	});
});
