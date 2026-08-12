import { describe, expect, it } from 'vitest';
import { formatBuildDate } from './format-build-date';

describe('formatBuildDate', () => {
	it('formats a valid ISO timestamp', () => {
		expect(formatBuildDate('2026-08-12T00:00:00.000Z')).toMatch(/2026/);
	});

	it('falls back to the raw string for non-date values', () => {
		expect(formatBuildDate('unknown')).toBe('unknown');
	});
});
