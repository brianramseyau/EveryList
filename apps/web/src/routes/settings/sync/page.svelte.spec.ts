import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { QueuedMutation } from '$lib/offline/db';
import {
	resetConnectivityForTesting,
	setLastSuccessfulSyncAtForTesting,
	setServerUnavailableForTesting
} from '$lib/offline/connectivity.svelte';

vi.mock('$lib/offline/sync-queue', () => ({
	queueCounts: vi.fn(),
	pendingMutations: vi.fn(),
	failedMutations: vi.fn()
}));
vi.mock('$lib/offline/flush', () => ({ flushQueue: vi.fn(), onFlushOutcome: vi.fn() }));

const { queueCounts, pendingMutations, failedMutations } = await import('$lib/offline/sync-queue');
const { flushQueue } = await import('$lib/offline/flush');
const SyncStatusPage = (await import('./+page.svelte')).default;

function mutation(overrides: Partial<QueuedMutation> & { id: number }): QueuedMutation {
	return {
		entityType: 'item',
		op: 'update',
		targetId: 5,
		expectedVersion: 1,
		payload: {},
		url: '/api/v1/x',
		status: 'pending',
		attempts: 0,
		createdAt: 0,
		...overrides
	};
}

describe('Sync status +page.svelte', () => {
	afterEach(() => {
		resetConnectivityForTesting();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('shows the connected empty state', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([]);
		vi.mocked(failedMutations).mockResolvedValue([]);

		render(SyncStatusPage);

		await expect.element(page.getByText('Connected', { exact: true })).toBeInTheDocument();
		await expect
			.element(
				page.getByText(
					'Everything is synced. Changes made offline are queued here until the server is reachable again.'
				)
			)
			.toBeInTheDocument();
	});

	it('shows the unavailable state and a Never last-sync time', async () => {
		setServerUnavailableForTesting(true);
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([]);
		vi.mocked(failedMutations).mockResolvedValue([]);

		render(SyncStatusPage);

		await expect.element(page.getByText('Unavailable', { exact: true })).toBeInTheDocument();
		await expect.element(page.getByText('Never', { exact: true })).toBeInTheDocument();
	});

	it('shows a formatted timestamp once a sync has succeeded', async () => {
		setLastSuccessfulSyncAtForTesting(0);
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([]);
		vi.mocked(failedMutations).mockResolvedValue([]);

		render(SyncStatusPage);

		await expect.element(page.getByText('Never', { exact: true })).not.toBeInTheDocument();
	});

	it('lists queued changes with descriptions and failure reasons', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 3, failed: 2, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([
			mutation({
				id: 1,
				op: 'create',
				targetId: -1,
				expectedVersion: null,
				payload: { name: 'Milk' }
			}),
			mutation({ id: 2, entityType: 'store', op: 'delete', targetId: 9 }),
			mutation({ id: 3, lastError: 'Failed to fetch' })
		]);
		vi.mocked(failedMutations).mockResolvedValue([
			mutation({
				id: 4,
				entityType: 'category',
				status: 'failed',
				attempts: 8,
				lastError: 'Forbidden'
			}),
			mutation({
				id: 5,
				entityType: 'favorite_item',
				status: 'failed',
				attempts: 1,
				lastError: 'Conflict'
			})
		]);

		render(SyncStatusPage);

		await expect.element(page.getByText('Create item "Milk"')).toBeInTheDocument();
		await expect.element(page.getByText('Delete store')).toBeInTheDocument();
		await expect.element(page.getByText('Update item')).toBeInTheDocument();
		await expect.element(page.getByText('Update category')).toBeInTheDocument();
		await expect.element(page.getByText('Update favorite item')).toBeInTheDocument();
		await expect.element(page.getByText('Failed to fetch')).toBeInTheDocument();
		await expect.element(page.getByText('Forbidden (8 attempts)')).toBeInTheDocument();
		await expect.element(page.getByText('Conflict (1 attempt)')).toBeInTheDocument();
		await expect.element(page.getByText('Pending', { exact: true }).first()).toBeInTheDocument();
		await expect.element(page.getByText('Failed', { exact: true }).first()).toBeInTheDocument();
	});

	it('retries the queue from the Retry now button', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 1, failed: 0, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([mutation({ id: 1 })]);
		vi.mocked(failedMutations).mockResolvedValue([]);
		vi.mocked(flushQueue).mockResolvedValue(undefined);

		render(SyncStatusPage);
		await expect.element(page.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Retry now' }).click();

		expect(flushQueue).toHaveBeenCalled();
	});

	it('re-enables the Retry now button when the flush rejects', async () => {
		vi.mocked(queueCounts).mockResolvedValue({ pending: 1, failed: 0, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([mutation({ id: 1 })]);
		vi.mocked(failedMutations).mockResolvedValue([]);
		vi.mocked(flushQueue).mockRejectedValue(new Error('offline'));

		render(SyncStatusPage);
		await expect.element(page.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Retry now' }).click();

		await expect.element(page.getByRole('button', { name: 'Retry now' })).not.toBeDisabled();
	});

	it('polls for updated counts on an interval while mounted', async () => {
		vi.useFakeTimers();
		vi.mocked(queueCounts).mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
		vi.mocked(pendingMutations).mockResolvedValue([]);
		vi.mocked(failedMutations).mockResolvedValue([]);

		render(SyncStatusPage);
		await vi.advanceTimersByTimeAsync(0);
		expect(queueCounts).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(3000);
		expect(queueCounts).toHaveBeenCalledTimes(2);
	});
});
