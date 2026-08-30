import type { AlexaPreferenceDto } from '@everylist/shared';
import { apiGet, apiPatch } from './client';

export function fetchAlexaPreference(): Promise<AlexaPreferenceDto> {
	return apiGet('/api/v1/alexa/preferences');
}

export function updateAlexaPreference(
	updates: Partial<Pick<AlexaPreferenceDto, 'defaultListId' | 'showChecked'>>
): Promise<AlexaPreferenceDto> {
	return apiPatch('/api/v1/alexa/preferences', updates);
}
