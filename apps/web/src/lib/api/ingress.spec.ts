import { describe, expect, it } from 'vitest';
import { ingressBase, isIngress } from './ingress';

// This runs in the "server" (node) project, which has no `window` — it
// exercises the SSR/prerendering guard. See ingress.svelte.spec.ts for the
// real-window behavior in a browser.
describe('ingress (no window)', () => {
	it('ingressBase returns an empty string without throwing', () => {
		expect(ingressBase()).toBe('');
	});

	it('isIngress is false', () => {
		expect(isIngress()).toBe(false);
	});
});
