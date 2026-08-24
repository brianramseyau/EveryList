import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ColorPicker from './ColorPicker.svelte';

describe('ColorPicker.svelte', () => {
	it('shows a swatch of the current color on the trigger button', async () => {
		render(ColorPicker, { value: '#3b82f6', onselect: vi.fn() });

		await expect.element(page.getByRole('button', { name: 'Color' })).toBeInTheDocument();
	});

	it('opens a palette and calls onselect with the chosen hex color', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#ef4444' }).click();

		expect(onselect).toHaveBeenCalledWith('#ef4444');
	});

	it('closes the palette after a selection', async () => {
		render(ColorPicker, { value: '#3b82f6', onselect: vi.fn() });

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#22c55e' }).click();

		await expect.element(page.getByRole('button', { name: '#22c55e' })).not.toBeInTheDocument();
	});

	it('updates the field as you type without committing until blur', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		const hexInput = page.getByLabelText('Custom hex color');
		await hexInput.fill('#123abc');

		await expect.element(hexInput).toHaveValue('#123abc');
		expect(onselect).not.toHaveBeenCalled();
	});

	it('does not call onselect while the custom field holds an invalid hex', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByLabelText('Custom hex color').fill('notacolor');

		expect(onselect).not.toHaveBeenCalled();
	});

	it('reverts the custom field to the current value on blur if left invalid', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		const hexInput = page.getByLabelText('Custom hex color');
		await hexInput.fill('notacolor');
		await hexInput.element().blur();

		await expect.element(hexInput).toHaveValue('#3b82f6');
		expect(onselect).not.toHaveBeenCalled();
	});

	it('commits the custom field on blur when left with a valid hex', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		const hexInput = page.getByLabelText('Custom hex color');
		await hexInput.fill('#123abc');
		onselect.mockClear();
		await hexInput.element().blur();

		expect(onselect).toHaveBeenCalledWith('#123abc');
	});

	it('commits the custom field on Enter, same as blur', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		const hexInput = page.getByLabelText('Custom hex color');
		await hexInput.fill('#123abc');
		hexInput.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

		await expect.poll(() => onselect.mock.calls).toEqual([['#123abc']]);
	});

	it('calls onselect when a color is chosen via the native color input', async () => {
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByLabelText('Pick a custom color').fill('#654321');

		expect(onselect).toHaveBeenCalledWith('#654321');
	});

	it('ignores a non-hex value from the color input rather than crashing', async () => {
		// Real browsers only ever emit a well-formed hex from a native
		// <input type="color">, but nothing stops another input source (a
		// browser extension, an automated test) from dispatching something
		// else — the handler should just no-op instead of calling onselect.
		const onselect = vi.fn();
		render(ColorPicker, { value: '#3b82f6', onselect });

		await page.getByRole('button', { name: 'Color' }).click();
		const colorInput = page.getByLabelText('Pick a custom color').element() as HTMLInputElement;
		// Browsers normalize an out-of-format assignment to `.value` on a
		// color input (e.g. to "#000000"), so shadow the property to force
		// a non-hex value through to the handler.
		Object.defineProperty(colorInput, 'value', { value: 'notacolor', configurable: true });
		colorInput.dispatchEvent(new Event('input', { bubbles: true }));

		expect(onselect).not.toHaveBeenCalled();
	});
});
