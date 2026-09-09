import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiPatch: vi.fn()
}));

const { apiGet, apiPost, apiPatch } = await import('./client');
const { fetchBackupState, updateBackupSettings, runBackupNow } = await import('./backups');

describe('backups api', () => {
	it('fetchBackupState GETs the backup-settings state', () => {
		fetchBackupState();
		expect(apiGet).toHaveBeenCalledWith('/api/v1/backup-settings');
	});

	it('updateBackupSettings PATCHes the schedule fields', () => {
		updateBackupSettings('monthly', '02:15', 6);
		expect(apiPatch).toHaveBeenCalledWith('/api/v1/backup-settings', {
			frequency: 'monthly',
			timeOfDay: '02:15',
			retentionCount: 6
		});
	});

	it('runBackupNow POSTs to the run endpoint', () => {
		runBackupNow();
		expect(apiPost).toHaveBeenCalledWith('/api/v1/backup-settings/run');
	});
});
