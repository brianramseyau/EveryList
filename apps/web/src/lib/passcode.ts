/**
 * List passcode lock — see PHASE7_PLAN.md §2. This is a local, shared-device
 * deterrent, not a cryptographic secret: any list member already has full
 * API access to the list, and the hash itself is visible to every member in
 * the `ListDto`. The PIN only gates the client-side render of the list body
 * on this device. Hashing happens client-side (SHA-256 via Web Crypto) so
 * the server never sees the raw PIN and unlocking works fully offline —
 * `GET /api/v1/lists/:id` already rides the service worker's
 * stale-while-revalidate cache (§9), so the hash is available offline too.
 */

const SESSION_PREFIX = 'everylist:unlocked:';

function hasWindow(): boolean {
	return typeof window !== 'undefined';
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function generateSalt(): string {
	return toHex(crypto.getRandomValues(new Uint8Array(16)));
}

async function digest(salt: string, pin: string): Promise<string> {
	const bytes = new TextEncoder().encode(`${salt}:${pin}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
	return toHex(new Uint8Array(hashBuffer));
}

/** Builds a fresh `"<saltHex>:<sha256Hex>"` for a newly-set PIN. */
export async function buildPasscodeHash(pin: string): Promise<string> {
	const salt = generateSalt();
	return `${salt}:${await digest(salt, pin)}`;
}

/** Compares a PIN against a stored `"<saltHex>:<sha256Hex>"` hash. */
export async function verifyPasscode(pin: string, storedHash: string): Promise<boolean> {
	const [salt, hash] = storedHash.split(':');
	if (!salt || !hash) return false;
	return (await digest(salt, pin)) === hash;
}

/** Session-scoped (per tab-session, not per device) — resets on a fresh app open. */
export function isListUnlocked(listId: number): boolean {
	if (!hasWindow()) return false;
	return window.sessionStorage.getItem(SESSION_PREFIX + listId) === '1';
}

export function unlockList(listId: number): void {
	if (!hasWindow()) return;
	window.sessionStorage.setItem(SESSION_PREFIX + listId, '1');
}
