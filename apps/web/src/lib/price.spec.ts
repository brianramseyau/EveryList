import { describe, expect, it } from 'vitest';
import { sanitizePriceInput } from './price';

describe('sanitizePriceInput', () => {
	it('leaves a plain decimal amount unchanged', () => {
		expect(sanitizePriceInput('12.99')).toBe('12.99');
	});

	it('strips a leading currency symbol', () => {
		expect(sanitizePriceInput('$12.99')).toBe('12.99');
	});

	it('strips thousands separators and a trailing currency code', () => {
		expect(sanitizePriceInput('1,234.56 USD')).toBe('1234.56');
	});

	it('drops every character when there are no digits at all', () => {
		expect(sanitizePriceInput('abc')).toBe('');
	});

	it('keeps only the first decimal point when more than one is pasted', () => {
		expect(sanitizePriceInput('1.234.56')).toBe('1.23456');
	});

	it('returns an empty string unchanged', () => {
		expect(sanitizePriceInput('')).toBe('');
	});
});
