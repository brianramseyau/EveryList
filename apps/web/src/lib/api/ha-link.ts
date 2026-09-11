import type { HaLinkDto } from '@everylist/shared';
import { apiGet, apiPatch } from './client';

export function fetchHaLink(): Promise<HaLinkDto> {
	return apiGet('/api/v1/ha-link');
}

export function updateHaLink(input: { haUsername: string | null }): Promise<HaLinkDto> {
	return apiPatch('/api/v1/ha-link', input);
}
