import { describe, expect, it } from 'vitest';
import { isManagedToken, widgetTokenName } from './widget-token';

describe('widget-token', () => {
	it('suffixes the widget token name with the device id', () => {
		expect(widgetTokenName('abc')).toBe('Home-screen widget (abc)');
	});

	it('recognises managed names, including the legacy unsuffixed one', () => {
		expect(isManagedToken('Home-screen widget (abc)')).toBe(true);
		expect(isManagedToken('Home-screen widget')).toBe(true);
		expect(isManagedToken('Home Assistant')).toBe(false);
		expect(isManagedToken(null)).toBe(false);
	});
});
