import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConfirmDialog from './ConfirmDialog.svelte';

describe('ConfirmDialog.svelte', () => {
	it('shows the message and default button labels', async () => {
		render(ConfirmDialog, {
			message: 'Discard your changes?',
			onConfirm: vi.fn(),
			onCancel: vi.fn()
		});

		await expect.element(page.getByText('Discard your changes?')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	});

	it('supports custom button labels', async () => {
		render(ConfirmDialog, {
			message: 'Delete this list?',
			confirmLabel: 'Delete',
			cancelLabel: 'Keep it',
			onConfirm: vi.fn(),
			onCancel: vi.fn()
		});

		await expect.element(page.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
	});

	it('calls onConfirm when the confirm button is clicked', async () => {
		const onConfirm = vi.fn();
		render(ConfirmDialog, { message: 'Discard?', onConfirm, onCancel: vi.fn() });

		await page.getByRole('button', { name: 'Discard' }).click();

		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it('calls onCancel when the cancel button is clicked', async () => {
		const onCancel = vi.fn();
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel });

		await page.getByRole('button', { name: 'Cancel' }).click();

		expect(onCancel).toHaveBeenCalledOnce();
	});

	it('calls onCancel on Escape', async () => {
		const onCancel = vi.fn();
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel });

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(onCancel).toHaveBeenCalledOnce();
	});

	it('ignores other keys', async () => {
		const onCancel = vi.fn();
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel });

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		expect(onCancel).not.toHaveBeenCalled();
	});

	it('calls onCancel on an outside click', async () => {
		const onCancel = vi.fn();
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel });

		document.body.click();

		expect(onCancel).toHaveBeenCalledOnce();
	});

	it('does not call onCancel when clicking inside the dialog', async () => {
		const onCancel = vi.fn();
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel });

		await page.getByText('Discard?').click();

		expect(onCancel).not.toHaveBeenCalled();
	});

	it('moves initial focus to the Cancel button', async () => {
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('restores focus to the previously-focused element once closed', async () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Back';
		document.body.appendChild(trigger);
		trigger.focus();

		const screen = render(ConfirmDialog, {
			message: 'Discard?',
			onConfirm: vi.fn(),
			onCancel: vi.fn()
		});
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();

		screen.unmount();
		expect(document.activeElement).toBe(trigger);

		trigger.remove();
	});

	it('wraps Tab from the confirm button back to Cancel', async () => {
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel: vi.fn() });

		await page.getByRole('button', { name: 'Discard' }).element().focus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		);

		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('leaves a plain Tab from the cancel button to the browser default (no forced wrap)', async () => {
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
		);

		// Neither the shiftKey+cancel nor the !shiftKey+confirm branch matches from here,
		// so the handler leaves focus alone rather than forcing it onto either button.
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
	});

	it('wraps Shift+Tab from the cancel button to the confirm button', async () => {
		render(ConfirmDialog, { message: 'Discard?', onConfirm: vi.fn(), onCancel: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
		);

		await expect.element(page.getByRole('button', { name: 'Discard' })).toHaveFocus();
	});
});
