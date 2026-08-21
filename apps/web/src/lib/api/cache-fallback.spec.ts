import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { withCacheFallback } from './cache-fallback';

describe('withCacheFallback', () => {
	it('returns the request result and never calls fallback on success', async () => {
		const fallback = vi.fn();

		const result = await withCacheFallback(async () => 'fresh', fallback);

		expect(result).toBe('fresh');
		expect(fallback).not.toHaveBeenCalled();
	});

	it('rethrows an ApiError without calling fallback', async () => {
		const apiError = new ApiError(403, 'Forbidden');
		const fallback = vi.fn();

		await expect(withCacheFallback(() => Promise.reject(apiError), fallback)).rejects.toBe(
			apiError
		);
		expect(fallback).not.toHaveBeenCalled();
	});

	it('returns the fallback result when the request fails with a non-ApiError', async () => {
		const result = await withCacheFallback(
			() => Promise.reject(new TypeError('Failed to fetch')),
			async () => 'cached'
		);

		expect(result).toBe('cached');
	});

	it('rethrows the original error when the fallback also yields undefined', async () => {
		const networkError = new TypeError('Failed to fetch');

		await expect(
			withCacheFallback(
				() => Promise.reject(networkError),
				async () => undefined
			)
		).rejects.toBe(networkError);
	});
});
