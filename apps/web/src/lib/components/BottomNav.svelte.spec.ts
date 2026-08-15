import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

// $app/state's `page` is read-only application state normally supplied by
// SvelteKit's router; stub it with a mutable pathname so each test can
// exercise a different active route. See lists/[id]/page.svelte.spec.ts for
// the same $app/state mocking pattern used elsewhere in this codebase.
const state = vi.hoisted(() => ({ pathname: '/lists', badgingSupported: true }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return { pathname: state.pathname };
		}
	}
}));

// The Badging API pill is the in-app fallback for when it's unsupported (see
// badge.svelte.spec.ts for badge.ts's own logic) — controlling support here
// independently of the real test browser's actual capability lets both the
// hidden and shown states be exercised.
let badgeListener: ((count: number) => void) | null = null;
vi.mock('$lib/pwa/badge', () => ({
	getBadgeCount: () => 0,
	isBadgingSupported: () => state.badgingSupported,
	onBadgeCountChange: (listener: ((count: number) => void) | null) => {
		badgeListener = listener;
	}
}));

const BottomNav = (await import('./BottomNav.svelte')).default;

describe('BottomNav.svelte', () => {
	it('renders a link for each section with the resolved href', () => {
		state.pathname = '/lists';
		const { container } = render(BottomNav);

		const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(['/lists', '/settings']);

		const labels = [...container.querySelectorAll('a span')].map((span) => span.textContent);
		expect(labels).toEqual(['Lists', 'Settings']);
	});

	it('marks the Lists link active on the list index', () => {
		state.pathname = '/lists';
		const { container } = render(BottomNav);

		const links = [...container.querySelectorAll('a')];
		expect(links[0]?.getAttribute('aria-current')).toBe('page');
		expect(links[1]?.getAttribute('aria-current')).toBeNull();
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
		expect(links[1]?.getAttribute('aria-current')).toBe('page');
		expect(links[0]?.getAttribute('aria-current')).toBeNull();
	});

	it('shows the in-app badge fallback pill when the Badging API is unsupported', async () => {
		state.pathname = '/lists';
		state.badgingSupported = false;
		const { container } = render(BottomNav);

		badgeListener?.(3);
		await tick();

		expect(container.querySelector('.bg-red-600')?.textContent?.trim()).toBe('3');
		state.badgingSupported = true;
	});

	it('caps the fallback pill at "99+"', async () => {
		state.pathname = '/lists';
		state.badgingSupported = false;
		const { container } = render(BottomNav);

		badgeListener?.(150);
		await tick();

		expect(container.querySelector('.bg-red-600')?.textContent?.trim()).toBe('99+');
		state.badgingSupported = true;
	});

	it('hides the fallback pill once the Badging API is supported', async () => {
		state.pathname = '/lists';
		state.badgingSupported = true;
		const { container } = render(BottomNav);

		badgeListener?.(3);
		await tick();

		expect(container.querySelector('.bg-red-600')).toBeNull();
	});

	it('hides the fallback pill when the count drops back to zero', async () => {
		state.pathname = '/lists';
		state.badgingSupported = false;
		const { container } = render(BottomNav);

		badgeListener?.(3);
		badgeListener?.(0);
		await tick();

		expect(container.querySelector('.bg-red-600')).toBeNull();
		state.badgingSupported = true;
	});

	it('unsubscribes the badge listener on unmount', async () => {
		const { unmount } = render(BottomNav);
		await unmount();

		expect(badgeListener).toBeNull();
	});
});
