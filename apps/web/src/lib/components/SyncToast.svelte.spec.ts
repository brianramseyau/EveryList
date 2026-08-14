import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SyncToast from './SyncToast.svelte';

describe('SyncToast.svelte', () => {
	it('renders nothing when not visible', async () => {
		render(SyncToast, { visible: false, onrefresh: vi.fn(), ondismiss: vi.fn() });

		await expect.element(page.getByText('This list was updated')).not.toBeInTheDocument();
	});

	it('shows the toast and calls onrefresh', async () => {
		const onrefresh = vi.fn();
		render(SyncToast, { visible: true, onrefresh, ondismiss: vi.fn() });

		await expect.element(page.getByText('This list was updated')).toBeInTheDocument();
		await page.getByRole('button', { name: 'Refresh' }).click();
		expect(onrefresh).toHaveBeenCalled();
	});

	it('calls ondismiss', async () => {
		const ondismiss = vi.fn();
		render(SyncToast, { visible: true, onrefresh: vi.fn(), ondismiss });

		await page.getByRole('button', { name: 'Dismiss' }).click();
		expect(ondismiss).toHaveBeenCalled();
	});
});
