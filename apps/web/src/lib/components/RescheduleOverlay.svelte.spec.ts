import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RescheduleOverlay from './RescheduleOverlay.svelte';

vi.mock('$lib/api/items', () => ({ updateItem: vi.fn() }));
vi.mock('$lib/notifications/sync', () => ({
	getDeadlineNotificationsPreference: vi.fn().mockReturnValue(false),
	resyncDeadlineNotifications: vi.fn().mockResolvedValue(undefined)
}));

const { updateItem } = await import('$lib/api/items');
const { getDeadlineNotificationsPreference, resyncDeadlineNotifications } =
	await import('$lib/notifications/sync');

// A fixed local instant: 2026-09-05 15:00 — a Saturday.
const NOW = new Date(2026, 8, 5, 15, 0, 0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	vi.mocked(updateItem).mockResolvedValue(undefined);
	vi.mocked(getDeadlineNotificationsPreference).mockReturnValue(false);
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('RescheduleOverlay.svelte', () => {
	it('shows the "1 hour" shortcut for a timed deadline', async () => {
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: /1 hour/ })).toBeInTheDocument();
	});

	it('hides the "1 hour" shortcut for a date-only deadline', async () => {
		render(RescheduleOverlay, { listId: 1, itemId: 1, deadline: '2026-09-06', onClose: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Tomorrow' })).toBeInTheDocument();
		expect(page.getByRole('button', { name: /1 hour/ }).elements()).toHaveLength(0);
	});

	it('patches the deadline and closes when a shortcut is chosen', async () => {
		const onClose = vi.fn();
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 42,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByRole('button', { name: /Tomorrow/ }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 42, { deadline: '2026-09-06T09:00' });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('resyncs native deadline notifications when the preference is on', async () => {
		vi.mocked(getDeadlineNotificationsPreference).mockReturnValue(true);
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: /Tomorrow/ }).click();

		expect(resyncDeadlineNotifications).toHaveBeenCalled();
	});

	it('reveals date/time inputs and applies a custom deadline', async () => {
		const onClose = vi.fn();
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByRole('button', { name: 'Custom…' }).click();
		const dateInput = page.getByLabelText('Date').element() as HTMLInputElement;
		const timeInput = page.getByLabelText('Time (optional)').element() as HTMLInputElement;
		dateInput.value = '2026-09-20';
		dateInput.dispatchEvent(new Event('input', { bubbles: true }));
		timeInput.value = '08:15';
		timeInput.dispatchEvent(new Event('input', { bubbles: true }));

		await page.getByRole('button', { name: 'Apply' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 1, { deadline: '2026-09-20T08:15' });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('shows an error and stays open when the patch fails', async () => {
		const onClose = vi.fn();
		vi.mocked(updateItem).mockRejectedValue(new Error('network error'));
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByRole('button', { name: /Tomorrow/ }).click();

		await expect
			.element(page.getByText("Couldn't reschedule the item. Try again."))
			.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('returns to the shortcut list from Custom via Back', async () => {
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose: vi.fn()
		});

		await page.getByRole('button', { name: 'Custom…' }).click();
		await expect.element(page.getByLabelText('Date')).toBeInTheDocument();

		await page.getByRole('button', { name: 'Back' }).click();

		await expect.element(page.getByRole('button', { name: 'Custom…' })).toBeInTheDocument();
		expect(page.getByLabelText('Date').elements()).toHaveLength(0);
	});

	it('ignores Escape and outside clicks while a reschedule is still in flight', async () => {
		const onClose = vi.fn();
		let resolveUpdate!: () => void;
		vi.mocked(updateItem).mockReturnValue(
			new Promise((resolve) => {
				resolveUpdate = () => resolve(undefined);
			})
		);
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByRole('button', { name: /Tomorrow/ }).click();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		document.body.click();
		expect(onClose).not.toHaveBeenCalled();

		resolveUpdate();
		await Promise.resolve();
		await Promise.resolve();
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('applies a custom date-only deadline when no time is set', async () => {
		const onClose = vi.fn();
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06',
			onClose
		});

		await page.getByRole('button', { name: 'Custom…' }).click();
		const dateInput = page.getByLabelText('Date').element() as HTMLInputElement;
		dateInput.value = '2026-09-20';
		dateInput.dispatchEvent(new Event('input', { bubbles: true }));

		await page.getByRole('button', { name: 'Apply' }).click();

		expect(updateItem).toHaveBeenCalledWith(1, 1, { deadline: '2026-09-20' });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('calls onClose on Cancel without patching anything', async () => {
		const onClose = vi.fn();
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(onClose).toHaveBeenCalledOnce();
		expect(updateItem).not.toHaveBeenCalled();
	});

	it('calls onClose on Escape', async () => {
		const onClose = vi.fn();
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(onClose).toHaveBeenCalledOnce();
	});

	it('calls onClose on an outside click, but not a click inside the dialog', async () => {
		const onClose = vi.fn();
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByText('Reschedule').click();
		expect(onClose).not.toHaveBeenCalled();

		document.body.click();
		expect(onClose).toHaveBeenCalledOnce();
	});

	function tab(shiftKey = false) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }));
	}

	it('wraps Tab from the last focusable element back to the first', async () => {
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose: vi.fn()
		});

		const first = page.getByRole('button', { name: /1 hour/ }).element() as HTMLElement;
		const last = page.getByRole('button', { name: 'Cancel' }).element() as HTMLElement;
		last.focus();

		tab();

		expect(document.activeElement).toBe(first);
	});

	it('wraps Shift+Tab from the first focusable element back to the last', async () => {
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose: vi.fn()
		});

		const first = page.getByRole('button', { name: /1 hour/ }).element() as HTMLElement;
		const last = page.getByRole('button', { name: 'Cancel' }).element() as HTMLElement;
		first.focus();

		tab(true);

		expect(document.activeElement).toBe(last);
	});

	it('leaves Tab alone (native behavior) when focus is on a middle element', async () => {
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose: vi.fn()
		});

		const middle = page.getByRole('button', { name: /Tomorrow/ }).element() as HTMLElement;
		middle.focus();

		tab();

		expect(document.activeElement).toBe(middle);
	});

	it('does nothing on Tab when every button is disabled mid-save', async () => {
		const onClose = vi.fn();
		let resolveUpdate!: () => void;
		vi.mocked(updateItem).mockReturnValue(
			new Promise((resolve) => {
				resolveUpdate = () => resolve(undefined);
			})
		);
		render(RescheduleOverlay, {
			listId: 1,
			itemId: 1,
			deadline: '2026-09-06T09:00',
			onClose
		});

		await page.getByRole('button', { name: /Tomorrow/ }).click();
		// Every button (including Cancel) is disabled while saving, so no focusable element
		// exists for Tab to wrap between — exercises that guard without throwing.
		expect(() => tab()).not.toThrow();

		resolveUpdate();
		await Promise.resolve();
		await Promise.resolve();
	});
});
