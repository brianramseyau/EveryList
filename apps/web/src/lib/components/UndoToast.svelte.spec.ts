import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import UndoToast from './UndoToast.svelte';

function swipeToastDown(toast: HTMLElement, distance: number) {
	toast.dispatchEvent(
		new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 })
	);
	toast.dispatchEvent(
		new PointerEvent('pointermove', {
			bubbles: true,
			pointerId: 1,
			clientX: 0,
			clientY: distance
		})
	);
	toast.dispatchEvent(
		new PointerEvent('pointerup', {
			bubbles: true,
			pointerId: 1,
			clientX: 0,
			clientY: distance
		})
	);
}

describe('UndoToast.svelte', () => {
	it('renders the message and action label', async () => {
		render(UndoToast, { message: 'Removed Milk', onAction: vi.fn(), onDismiss: vi.fn() });

		await expect.element(page.getByText('Removed Milk')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
	});

	it('fires onDismiss when swiped down past the commit threshold', async () => {
		const onDismiss = vi.fn();
		const onAction = vi.fn();
		render(UndoToast, { message: 'Removed Milk', onAction, onDismiss });

		swipeToastDown(page.getByRole('status').element() as HTMLElement, 60);

		expect(onDismiss).toHaveBeenCalledOnce();
		expect(onAction).not.toHaveBeenCalled();
	});

	it('snaps back without dismissing on a short downward drag', async () => {
		const onDismiss = vi.fn();
		const onAction = vi.fn();
		render(UndoToast, { message: 'Removed Milk', onAction, onDismiss });

		swipeToastDown(page.getByRole('status').element() as HTMLElement, 20);

		expect(onDismiss).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
	});

	it('clicking Undo calls onAction and never onDismiss', async () => {
		const onDismiss = vi.fn();
		const onAction = vi.fn();
		render(UndoToast, { message: 'Removed Milk', actionLabel: 'Restore', onAction, onDismiss });

		await page.getByRole('button', { name: 'Restore' }).click();

		expect(onAction).toHaveBeenCalledOnce();
		expect(onDismiss).not.toHaveBeenCalled();
	});
});
