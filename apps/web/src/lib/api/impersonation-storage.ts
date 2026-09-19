export const STORAGE_KEY = 'everylist:impersonation';

export interface Impersonation {
	/** The primary account's own token, restored on exit. */
	adminToken: string;
	/** The token minted for the target — compared against the live token so a stale entry (the
	 * impersonation expired, or the browser signed in as someone else) is never mistaken for an
	 * active session. */
	impersonationToken: string;
	label: string;
}

/** Reads the persisted impersonation, if any. Guards `window` because the module that calls this
 * at import time also runs during prerendering (Node). */
export function readStoredImpersonation(): Impersonation | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Impersonation) : null;
	} catch {
		return null;
	}
}
