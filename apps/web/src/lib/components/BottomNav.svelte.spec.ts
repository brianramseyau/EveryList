import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

// $app/state's `page` is read-only application state normally supplied by
// SvelteKit's router; stub it with a mutable pathname so each test can
// exercise a different active route. See lists/[id]/page.svelte.spec.ts for
// the same $app/state mocking pattern used elsewhere in this codebase.
const state = vi.hoisted(() => ({ pathname: '/lists' }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return { pathname: state.pathname };
		}
	}
}));

const BottomNav = (await import('./BottomNav.svelte')).default;

describe('BottomNav.svelte', () => {
	it('renders a link for each section with the resolved href', () => {
		state.pathname = '/lists';
		const { container } = render(BottomNav);

		const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(['/lists', '/favorites', '/settings']);

		const labels = [...container.querySelectorAll('a span')].map((span) => span.textContent);
		expect(labels).toEqual(['Lists', 'Favorites', 'Settings']);
	});

	it('marks the Lists link active on the list index', () => {
		state.pathname = '/lists';
		const { container } = render(BottomNav);

		const links = [...container.querySelectorAll('a')];
		expect(links[0]?.getAttribute('aria-current')).toBe('page');
		expect(links[1]?.getAttribute('aria-current')).toBeNull();
		expect(links[2]?.getAttribute('aria-current')).toBeNull();
	});

	it('marks the Lists link active on a nested list-detail route', () => {
		state.pathname = '/lists/5/categories';
		const { container } = render(BottomNav);

		const links = [...container.querySelectorAll('a')];
		expect(links[0]?.getAttribute('aria-current')).toBe('page');
	});

	it('marks the Settings link active on the settings route', () => {
		state.pathname = '/settings';
		const { container } = render(BottomNav);

		const links = [...container.querySelectorAll('a')];
		expect(links[2]?.getAttribute('aria-current')).toBe('page');
		expect(links[0]?.getAttribute('aria-current')).toBeNull();
	});
});
