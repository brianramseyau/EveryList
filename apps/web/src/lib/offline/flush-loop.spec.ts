import { describe, expect, it } from 'vitest';
import { startFlushLoop } from './flush';

// Plain node spec — no `window` global, mirroring realtime.spec.ts's SSR-guard coverage.
describe('startFlushLoop without a window (SSR/prerender)', () => {
	it('is a no-op', () => {
		expect(() => startFlushLoop()).not.toThrow();
	});
});
