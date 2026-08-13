import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import HomePage from './+page.svelte';

describe('Home +page.svelte', () => {
	afterEach(() => {
		clearToken();
	});

	it('shows "Get started" and a login link when signed out', async () => {
		render(HomePage);

		await expect.element(page.getByText('Get started')).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
	});

	it('shows "My Lists" and hides the login link when signed in', async () => {
		setToken('test-token');

		render(HomePage);

		await expect.element(page.getByText('My Lists')).toBeInTheDocument();
		await expect.element(page.getByRole('link', { name: 'Log in' })).not.toBeInTheDocument();
	});
});
