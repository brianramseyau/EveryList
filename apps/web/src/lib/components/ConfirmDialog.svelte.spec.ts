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
});
