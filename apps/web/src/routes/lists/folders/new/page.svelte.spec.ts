import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setToken, clearToken } from '$lib/api/token';
import { ApiError } from '$lib/api/client';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/folders', () => ({ createFolder: vi.fn() }));

const { goto } = await import('$app/navigation');
const { createFolder } = await import('$lib/api/folders');
const NewFolderPage = (await import('./+page.svelte')).default;

describe('New Folder +page.svelte', () => {
	beforeEach(() => {
		setToken('test-token');
		vi.mocked(goto).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		clearToken();
	});

	it('redirects to /login when there is no token', async () => {
		clearToken();

		render(NewFolderPage);

		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
	});

	it('disables Save until a name is entered', async () => {
		render(NewFolderPage);

		await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();

		await page.getByPlaceholder('Folder name').fill('Groceries');

		await expect.element(page.getByRole('button', { name: 'Save' })).not.toBeDisabled();
	});

	it('does not submit when the name is only whitespace', async () => {
		render(NewFolderPage);

		const input = page.getByPlaceholder('Folder name');
		await input.fill('   ');
		input
			.element()
			.closest('form')
			?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

		await expect.poll(() => vi.mocked(createFolder).mock.calls.length).toBe(0);
	});

	it('creates a folder with the default color, then navigates back to the Manage Folders screen', async () => {
		vi.mocked(createFolder).mockResolvedValue({
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#3b82f6',
			sortOrder: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			version: 1
		});

		render(NewFolderPage);

		await page.getByPlaceholder('Folder name').fill('Groceries');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createFolder).toHaveBeenCalledWith({ name: 'Groceries', color: '#3b82f6' });
		await expect.poll(() => vi.mocked(goto).mock.calls.length).toBe(1);
		expect(vi.mocked(goto).mock.calls[0]?.[0]).toBe('/lists/folders');
	});

	it('picks a color for the new folder', async () => {
		vi.mocked(createFolder).mockResolvedValue({
			id: 5,
			userId: 1,
			name: 'Groceries',
			color: '#22c55e',
			sortOrder: 0,
			createdAt: '2026-08-01T00:00:00.000Z',
			updatedAt: null,
			version: 1
		});

		render(NewFolderPage);

		await page.getByRole('button', { name: 'Color' }).click();
		await page.getByRole('button', { name: '#22c55e' }).click();

		await page.getByPlaceholder('Folder name').fill('Groceries');
		await page.getByRole('button', { name: 'Save' }).click();

		expect(createFolder).toHaveBeenCalledWith({ name: 'Groceries', color: '#22c55e' });
	});

	it('shows a generic error message when creating a folder fails without an ApiError', async () => {
		vi.mocked(createFolder).mockRejectedValue(new TypeError('network down'));

		render(NewFolderPage);

		await page.getByPlaceholder('Folder name').fill('Groceries');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Failed to create folder.')).toBeInTheDocument();
	});

	it('shows the ApiError message when creating a folder fails', async () => {
		vi.mocked(createFolder).mockRejectedValue(new ApiError(422, 'Name already exists'));

		render(NewFolderPage);

		await page.getByPlaceholder('Folder name').fill('Groceries');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Name already exists')).toBeInTheDocument();
	});

	it('links Cancel back to the Manage Folders screen', async () => {
		render(NewFolderPage);

		const cancelLink = page.getByRole('link', { name: 'Cancel' });
		await expect.element(cancelLink).toBeInTheDocument();
		expect(cancelLink.element().getAttribute('href')).toBe('/lists/folders');
	});
});
