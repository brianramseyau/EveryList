import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';
import type { BackupSettingsStateDto } from '@everylist/shared';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/backups', () => ({
	fetchBackupState: vi.fn(),
	updateBackupSettings: vi.fn(),
	runBackupNow: vi.fn()
}));

const { fetchBackupState, updateBackupSettings, runBackupNow } = await import('$lib/api/backups');
const { goto } = await import('$app/navigation');
const BackupsPage = (await import('./+page.svelte')).default;

function state(overrides: Partial<BackupSettingsStateDto> = {}): BackupSettingsStateDto {
	return {
		settings: {
			frequency: 'weekly',
			timeOfDay: '03:00',
			retentionCount: 4
		},
		files: [],
		...overrides
	};
}

describe('Backups +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(fetchBackupState).mockResolvedValue(state());
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(BackupsPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('shows a generic error message when loading fails without an ApiError', async () => {
		vi.mocked(fetchBackupState).mockRejectedValue(new TypeError('network down'));

		render(BackupsPage);

		await expect.element(page.getByText('Failed to load backup settings.')).toBeInTheDocument();
	});

	it('shows the ApiError message when loading fails', async () => {
		vi.mocked(fetchBackupState).mockRejectedValue(new ApiError(500, 'Server exploded'));

		render(BackupsPage);

		await expect.element(page.getByText('Server exploded')).toBeInTheDocument();
	});

	it('pre-fills the form from the loaded settings', async () => {
		vi.mocked(fetchBackupState).mockResolvedValue(
			state({
				settings: { frequency: 'weekly', timeOfDay: '04:30', retentionCount: 14 }
			})
		);

		render(BackupsPage);

		await expect.element(page.getByLabelText('Frequency')).toHaveValue('weekly');
		await expect.element(page.getByLabelText('Time of day')).toHaveValue('04:30');
		await expect.element(page.getByLabelText('Backups to keep')).toHaveValue(14);
	});

	it('shows "no backup has run yet" and an empty file list by default', async () => {
		render(BackupsPage);

		await expect.element(page.getByText('No backup has run yet.')).toBeInTheDocument();
		await expect.element(page.getByText('No backup files yet.')).toBeInTheDocument();
	});

	it('shows the last backup time and file list once populated, with a kind badge', async () => {
		vi.mocked(fetchBackupState).mockResolvedValue(
			state({
				files: [
					{
						filename: 'everylist-automatic-20260822-030000.sqlite3',
						kind: 'automatic',
						sizeBytes: 2048,
						createdAt: '2026-08-22T03:00:00.000Z'
					}
				]
			})
		);

		render(BackupsPage);

		await expect
			.element(page.getByText('everylist-automatic-20260822-030000.sqlite3'))
			.toBeInTheDocument();
		await expect.element(page.getByText('automatic', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText(/2\.0 KB/)).toBeInTheDocument();
		await expect.element(page.getByText(/Last backup:/)).toBeInTheDocument();
	});

	it('shows a manual-kind badge distinctly from automatic', async () => {
		vi.mocked(fetchBackupState).mockResolvedValue(
			state({
				files: [
					{
						filename: 'everylist-manual-20260822-090000.sqlite3',
						kind: 'manual',
						sizeBytes: 4096,
						createdAt: '2026-08-22T09:00:00.000Z'
					}
				]
			})
		);

		render(BackupsPage);

		await expect.element(page.getByText('manual', { exact: true })).toBeInTheDocument();
	});

	it('updates the last-backup time from the file list when a newer backup replaces an already-shown one', async () => {
		vi.mocked(fetchBackupState).mockResolvedValue(
			state({
				files: [
					{
						filename: 'everylist-automatic-20260822-030000.sqlite3',
						kind: 'automatic',
						sizeBytes: 2048,
						createdAt: '2026-08-22T03:00:00.000Z'
					}
				]
			})
		);
		vi.mocked(runBackupNow).mockResolvedValue(
			// A manual run only ever adds a manual-kind file — the schedule
			// itself (frequency/timeOfDay/retentionCount) is untouched — so the
			// page must derive the shown time from the file list, not from
			// settings, which has no backup-time field at all.
			state({
				files: [
					{
						filename: 'everylist-manual-20260822-090000.sqlite3',
						kind: 'manual',
						sizeBytes: 4096,
						createdAt: '2026-08-22T09:00:00.000Z'
					},
					{
						filename: 'everylist-automatic-20260822-030000.sqlite3',
						kind: 'automatic',
						sizeBytes: 2048,
						createdAt: '2026-08-22T03:00:00.000Z'
					}
				]
			})
		);

		render(BackupsPage);
		await expect.element(page.getByText(/Last backup:/)).toBeInTheDocument();

		await page.getByRole('button', { name: 'Back up now' }).click();

		await expect.poll(() => vi.mocked(runBackupNow).mock.calls.length).toBe(1);
		await expect
			.element(page.getByText('everylist-manual-20260822-090000.sqlite3'))
			.toBeInTheDocument();
		await expect.element(page.getByText(/Last backup:/)).toBeInTheDocument();
	});

	it('saves the schedule and applies the returned state', async () => {
		vi.mocked(updateBackupSettings).mockResolvedValue(
			state({
				settings: { frequency: 'monthly', timeOfDay: '02:15', retentionCount: 20 }
			})
		);

		render(BackupsPage);
		await page.getByLabelText('Frequency').selectOptions('monthly');
		await page.getByLabelText('Time of day').fill('02:15');
		await page.getByLabelText('Backups to keep').fill('20');
		await page.getByRole('button', { name: 'Save schedule' }).click();

		expect(updateBackupSettings).toHaveBeenCalledWith('monthly', '02:15', 20);
		await expect.element(page.getByLabelText('Frequency')).toHaveValue('monthly');
	});

	it('shows the ApiError message when saving fails', async () => {
		vi.mocked(updateBackupSettings).mockRejectedValue(new ApiError(422, 'Invalid schedule'));

		render(BackupsPage);
		await page.getByRole('button', { name: 'Save schedule' }).click();

		await expect.element(page.getByText('Invalid schedule')).toBeInTheDocument();
	});

	it('shows a generic error message when saving fails without an ApiError', async () => {
		vi.mocked(updateBackupSettings).mockRejectedValue(new TypeError('network down'));

		render(BackupsPage);
		await page.getByRole('button', { name: 'Save schedule' }).click();

		await expect.element(page.getByText('Failed to save backup settings.')).toBeInTheDocument();
	});

	it('runs a backup now and shows the resulting file', async () => {
		vi.mocked(runBackupNow).mockResolvedValue(
			state({
				files: [
					{
						filename: 'everylist-manual-20260822-090000.sqlite3',
						kind: 'manual',
						sizeBytes: 1024,
						createdAt: '2026-08-22T09:00:00.000Z'
					}
				]
			})
		);

		render(BackupsPage);
		await page.getByRole('button', { name: 'Back up now' }).click();

		expect(runBackupNow).toHaveBeenCalled();
		await expect
			.element(page.getByText('everylist-manual-20260822-090000.sqlite3'))
			.toBeInTheDocument();
	});

	it('shows the ApiError message when running a backup fails', async () => {
		vi.mocked(runBackupNow).mockRejectedValue(new ApiError(500, 'Backup failed'));

		render(BackupsPage);
		await page.getByRole('button', { name: 'Back up now' }).click();

		await expect.element(page.getByText('Backup failed')).toBeInTheDocument();
	});

	it('shows a generic error message when running a backup fails without an ApiError', async () => {
		vi.mocked(runBackupNow).mockRejectedValue(new TypeError('network down'));

		render(BackupsPage);
		await page.getByRole('button', { name: 'Back up now' }).click();

		await expect.element(page.getByText('Failed to run a backup.')).toBeInTheDocument();
	});
});
