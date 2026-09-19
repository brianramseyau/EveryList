import { apiPost } from './client';
import { impersonateAdminUser } from './admin-users';
import { getToken, setToken } from './token';
import { clearLocalData } from '../offline/db';

import { STORAGE_KEY, readStoredImpersonation, type Impersonation } from './impersonation-storage';

let current = $state<Impersonation | null>(readStoredImpersonation());

/** Display name of the user being impersonated, or null when this browser isn't impersonating. */
export function impersonatedLabel(): string | null {
	return current && current.impersonationToken === getToken() ? current.label : null;
}

function forget() {
	window.localStorage.removeItem(STORAGE_KEY);
	current = null;
}

/** Switches this browser to a session acting as `target`. The local cache is per-origin rather
 * than per-user, so it's wiped on the way in (and out) — otherwise the admin's cached lists would
 * show up as the target's. */
export async function startImpersonation(target: { id: number; label: string }): Promise<void> {
	const adminToken = getToken();
	const { token } = await impersonateAdminUser(target.id);
	// Nested impersonation can't happen (only the primary account may impersonate), but if the
	// admin's own token is somehow absent there'd be nothing to return to.
	if (!adminToken) throw new Error('Not signed in');

	current = { adminToken, impersonationToken: token, label: target.label };
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
	setToken(token);
	await clearLocalData();
}

/** Ends the impersonation and restores the admin's own session. */
export async function stopImpersonation(): Promise<void> {
	if (!current) return;
	const { adminToken } = current;
	try {
		// Revokes the impersonation token server-side. Best-effort: it expires within the hour
		// regardless, and failing to revoke must not strand the admin in the wrong account.
		await apiPost('/api/v1/account/logout');
	} catch {
		// see above
	}
	setToken(adminToken);
	forget();
	await clearLocalData();
}
