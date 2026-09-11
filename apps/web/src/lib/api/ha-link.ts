import type { HaLinkDto } from '@everylist/shared';
import { apiGet, apiPatch } from './client';

export function fetchHaLink(): Promise<HaLinkDto> {
	return apiGet('/api/v1/ha-link');
}

/** `password` is required to link a username other than the caller's currently Supervisor-detected
 *  identity (one-click linking that identity needs no password — Supervisor already proved it) —
 *  see `ha_link_controller.ts`'s validator comment for why manual linking can't skip this proof. */
export function updateHaLink(input: {
	haUsername: string | null;
	password?: string;
}): Promise<HaLinkDto> {
	return apiPatch('/api/v1/ha-link', input);
}
