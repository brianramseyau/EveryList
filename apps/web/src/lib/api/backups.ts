import type { BackupFrequency, BackupSettingsStateDto } from '@everylist/shared';
import { apiBaseUrl } from './base-url';
import { getToken } from './token';
import { apiGet, apiPatch, apiPost, ApiError } from './client';

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

/**
 * Fetches a backup file as a blob and saves it via a throwaway anchor —
 * the download endpoint requires the bearer token, so a plain `<a href>`
 * (which can't carry an Authorization header) won't work here.
 */
export async function downloadBackup(filename: string): Promise<void> {
	const token = getToken();
	const response = await fetch(
		`${apiBaseUrl()}/api/v1/backup-settings/download/${encodeURIComponent(filename)}`,
		{ headers: token ? { Authorization: `Bearer ${token}` } : {} }
	);
	if (!response.ok) {
		throw new ApiError(response.status, `Failed to download ${filename}`);
	}

	const blob = await response.blob();
	const url = URL.createObjectURL(blob);
	try {
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
	} finally {
		URL.revokeObjectURL(url);
	}
}
