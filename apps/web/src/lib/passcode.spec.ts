import { describe, expect, it } from 'vitest';
import { buildPasscodeHash, verifyPasscode } from './passcode';

// Hashing runs in Node (Web Crypto is a global here too) as well as the
// browser. Unlock state itself lives as plain component state in
// routes/lists/[id]/+page.svelte, not in this module — see that page's spec.
describe('passcode (hashing)', () => {
	it('buildPasscodeHash produces a "<salt>:<hash>" pair a matching PIN verifies against', async () => {
		const hash = await buildPasscodeHash('1234');
		expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
		expect(await verifyPasscode('1234', hash)).toBe(true);
	});

	it('rejects the wrong PIN', async () => {
		const hash = await buildPasscodeHash('1234');
		expect(await verifyPasscode('9999', hash)).toBe(false);
	});

	it('two hashes for the same PIN differ (random salt) but both verify', async () => {
		const first = await buildPasscodeHash('4242');
		const second = await buildPasscodeHash('4242');
		expect(first).not.toBe(second);
		expect(await verifyPasscode('4242', first)).toBe(true);
		expect(await verifyPasscode('4242', second)).toBe(true);
	});

	it('verifyPasscode returns false for a malformed stored hash', async () => {
		expect(await verifyPasscode('1234', 'not-a-valid-hash')).toBe(false);
		expect(await verifyPasscode('1234', '')).toBe(false);
	});
});
