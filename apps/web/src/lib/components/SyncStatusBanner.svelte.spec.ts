import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ConflictListener } from '$lib/offline/flush';

vi.mock('$lib/offline/sync-queue', () => ({ queueCounts: vi.fn() }));
vi.mock('$lib/offline/flush', () => ({ flushQueue: vi.fn(), onConflict: vi.fn() }));

const { queueCounts } = await import('$lib/offline/sync-queue');
const { flushQueue, onConflict } = await import('$lib/offline/flush');
const { default: SyncStatusBanner } = await import('./SyncStatusBanner.svelte');

afterEach(() => {
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('SyncStatusBanner.svelte', () => {
	it('renders nothing when the queue is empty', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });

		render(SyncStatusBanner);

		await expect.element(page.getByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
	});

	it('shows a pending count and pluralizes for more than one change', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 2, failed: 0, conflict: 0 });

		render(SyncStatusBanner);

		await expect.element(page.getByText('2 changes syncing…')).toBeInTheDocument();
	});

	it('does not pluralize a single pending change', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 1, failed: 0, conflict: 0 });

		render(SyncStatusBanner);

		await expect.element(page.getByText('1 change syncing…')).toBeInTheDocument();
	});

	it('calls out failed mutations separately from the total', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 1, failed: 2, conflict: 0 });

		render(SyncStatusBanner);

		await expect
			.element(page.getByText('3 changes waiting to sync — 2 failed'))
			.toBeInTheDocument();
	});

	it('retries the queue and refreshes the count on click', async () => {
		vi.mocked(queueCounts)
			.mockResolvedValueOnce({ pending: 1, failed: 0, conflict: 0 })
			.mockResolvedValueOnce({ pending: 0, failed: 0, conflict: 0 });
		vi.mocked(flushQueue).mockResolvedValue(undefined);

		render(SyncStatusBanner);
		await expect.element(page.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Retry now' }).click();

		expect(flushQueue).toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
	});

	it('re-enables the button after a failed retry', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 1, failed: 0, conflict: 0 });
		vi.mocked(flushQueue).mockRejectedValue(new Error('offline'));

		render(SyncStatusBanner);
		await expect.element(page.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Retry now' }).click();

		await expect.element(page.getByRole('button', { name: 'Retry now' })).not.toBeDisabled();
	});

	it('shows and auto-dismisses a toast when the flush loop reports a conflict', async () => {
		vi.useFakeTimers();
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		const captured: { handler: ConflictListener | null } = { handler: null };
		vi.mocked(onConflict).mockImplementation((listener) => {
			captured.handler = listener;
			return vi.fn();
		});

		render(SyncStatusBanner);
		await vi.advanceTimersByTimeAsync(0);

		captured.handler?.({} as Parameters<ConflictListener>[0]);
		await vi.advanceTimersByTimeAsync(0);
		await expect
			.element(page.getByText('Some changes were reconciled with a newer edit.'))
			.toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(6000);
		await expect
			.element(page.getByText('Some changes were reconciled with a newer edit.'))
			.not.toBeInTheDocument();
	});

	it('clears the previous conflict timeout when a second conflict arrives quickly', async () => {
		vi.useFakeTimers();
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		const captured: { handler: ConflictListener | null } = { handler: null };
		vi.mocked(onConflict).mockImplementation((listener) => {
			captured.handler = listener;
			return vi.fn();
		});

		render(SyncStatusBanner);
		await vi.advanceTimersByTimeAsync(0);

		captured.handler?.({} as Parameters<ConflictListener>[0]);
		await vi.advanceTimersByTimeAsync(3000);
		captured.handler?.({} as Parameters<ConflictListener>[0]);
		await vi.advanceTimersByTimeAsync(3000);

		// The second conflict's timer restarted the clock — still visible at 6s total.
		await expect
			.element(page.getByText('Some changes were reconciled with a newer edit.'))
			.toBeInTheDocument();
	});

	it('polls for updated counts on an interval while mounted', async () => {
		vi.useFakeTimers();
		vi.mocked(queueCounts)
			.mockResolvedValueOnce({ pending: 0, failed: 0, conflict: 0 })
			.mockResolvedValueOnce({ pending: 1, failed: 0, conflict: 0 });

		render(SyncStatusBanner);
		await vi.advanceTimersByTimeAsync(0);
		await expect.element(page.getByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();

		await vi.advanceTimersByTimeAsync(3000);
		await expect.element(page.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
	});
});
