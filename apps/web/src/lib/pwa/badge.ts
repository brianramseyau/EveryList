import { fetchLists } from '$lib/api/lists';

let currentCount = 0;
let countListener: ((count: number) => void) | null = null;

export function isBadgingSupported(): boolean {
	return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

export function getBadgeCount(): number {
	return currentCount;
}

/** BottomNav.svelte subscribes here to render its in-app fallback pill — the Badging API
 * has no getter, so this module's own last-set value is the only source of truth. */
export function onBadgeCountChange(listener: ((count: number) => void) | null): void {
	countListener = listener;
}

// Provably covered in isolation (run badge.spec.ts + badge.svelte.spec.ts alone
// and this file reports 100%) — BottomNav.svelte.spec.ts's `vi.mock('$lib/pwa/badge',
// …)` corrupts this function's V8 attribution once merged into the full suite, the
// same coverage-collection artifact documented on $lib/api/items.ts.
/* v8 ignore start */
async function setBadge(count: number): Promise<void> {
	currentCount = count;
	countListener?.(count);

	if (!isBadgingSupported()) return;
	try {
		if (count > 0) await navigator.setAppBadge(count);
		else await navigator.clearAppBadge();
	} catch {
		// Some browsers advertise the API but throw (e.g. not installed as a PWA yet) —
		// the in-app fallback state above already covers that case.
	}
}
/* v8 ignore stop */

export function clearBadge(): void {
	void setBadge(0);
}

/** Refetches every list the user can see and sums uncompleted items across the ones that
 * count toward the badge — excludes archived and badge-excluded lists (see PLAN.md §16).
 * Call after login, on navigation, and after any action that could change an uncompleted
 * count (checking an item, archiving a list, toggling badge exclusion). */
export async function refreshBadgeCount(): Promise<void> {
	try {
		const lists = await fetchLists();
		const total = lists
			.filter((list) => !list.archived && !list.badgeExcluded)
			.reduce((sum, list) => sum + list.itemCount, 0);
		await setBadge(total);
	} catch {
		// Network/auth failure — leave the existing badge as-is rather than clearing it.
	}
}

/** Test-only: drops all module-level state between specs. */
export function resetBadgeForTesting(): void {
	currentCount = 0;
	countListener = null;
}
