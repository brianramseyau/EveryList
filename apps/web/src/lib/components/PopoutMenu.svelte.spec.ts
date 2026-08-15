import { createRawSnippet } from 'svelte';
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PopoutMenu from './PopoutMenu.svelte';

const linkChildren = createRawSnippet(() => ({
	render: () => `<a href="/lists/new">Link one</a>`
}));

describe('PopoutMenu.svelte', () => {
	it('hides its children until the trigger is opened', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		await expect.element(page.getByRole('link', { name: 'Link one' })).not.toBeInTheDocument();
	});

	it('opens on trigger click to reveal its children', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		await page.getByRole('button', { name: 'Create' }).click();

		await expect.element(page.getByRole('link', { name: 'Link one' })).toBeInTheDocument();
	});

	it('closes again on a second click of the trigger', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		await page.getByRole('button', { name: 'Create' }).click();
		await expect.element(page.getByRole('link', { name: 'Link one' })).toBeInTheDocument();

		await page.getByRole('button', { name: 'Create' }).click();
		await expect.element(page.getByRole('link', { name: 'Link one' })).not.toBeInTheDocument();
	});

	it('closes when clicking outside the panel', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		await page.getByRole('button', { name: 'Create' }).click();
		await expect.element(page.getByRole('link', { name: 'Link one' })).toBeInTheDocument();

		document.body.click();
		await expect.element(page.getByRole('link', { name: 'Link one' })).not.toBeInTheDocument();
	});

	it('closes on Escape', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		await page.getByRole('button', { name: 'Create' }).click();
		await expect.element(page.getByRole('link', { name: 'Link one' })).toBeInTheDocument();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.element(page.getByRole('link', { name: 'Link one' })).not.toBeInTheDocument();
	});

	it('ignores Escape while already closed', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await expect.element(page.getByRole('link', { name: 'Link one' })).not.toBeInTheDocument();
	});

	it('sets aria-expanded to reflect open state', async () => {
		render(PopoutMenu, { label: 'Create', iconName: 'plus', children: linkChildren });

		const trigger = page.getByRole('button', { name: 'Create' });
		expect(trigger.element().getAttribute('aria-expanded')).toBe('false');

		await trigger.click();
		expect(trigger.element().getAttribute('aria-expanded')).toBe('true');
	});
});
