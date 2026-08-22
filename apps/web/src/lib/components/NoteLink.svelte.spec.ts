import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

vi.mock('$lib/open-external-link', () => ({ openExternalLink: vi.fn() }));

const { openExternalLink } = await import('$lib/open-external-link');
const NoteLink = (await import('./NoteLink.svelte')).default;

describe('NoteLink.svelte', () => {
	it('renders the URL as a new-tab link with no stray whitespace around it', () => {
		const { container } = render(NoteLink, { url: 'https://example.com/recipe' });

		// No leading/trailing whitespace text node — this component's whole
		// output must be exactly the <a>, so it slots inline between sibling
		// text segments in the notes line without adding extra spacing.
		expect(container.textContent).toBe('https://example.com/recipe');

		const link = page.getByRole('link', { name: 'https://example.com/recipe' });
		expect(link.element().getAttribute('href')).toBe('https://example.com/recipe');
		expect(link.element().getAttribute('target')).toBe('_blank');
		expect(link.element().getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('delegates the click to openExternalLink with the URL', async () => {
		render(NoteLink, { url: 'https://example.com/recipe' });

		await page.getByRole('link', { name: 'https://example.com/recipe' }).click();

		expect(openExternalLink).toHaveBeenCalledWith(
			'https://example.com/recipe',
			expect.any(MouseEvent)
		);
	});
});
