import type { BackupFrequency, BackupSettingsStateDto } from '@everylist/shared';
import { apiGet, apiPatch, apiPost } from './client';

export function fetchBackupState(): Promise<BackupSettingsStateDto> {
	return apiGet('/api/v1/backup-settings');
}

export function updateBackupSettings(
	frequency: BackupFrequency,
	timeOfDay: string,
	retentionCount: number
): Promise<BackupSettingsStateDto> {
	return apiPatch('/api/v1/backup-settings', { frequency, timeOfDay, retentionCount });
}

export function runBackupNow(): Promise<BackupSettingsStateDto> {
	return apiPost('/api/v1/backup-settings/run');
}
