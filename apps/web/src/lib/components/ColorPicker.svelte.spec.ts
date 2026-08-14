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
});
