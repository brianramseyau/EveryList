import { beforeNavigate, goto } from '$app/navigation';
import type { BeforeNavigate } from '@sveltejs/kit';

// Shared "unsaved changes" guard: intercepts in-app navigation (link clicks,
// goto(), back/forward) away from a page while `isDirty()` is true, and shows
// a confirm dialog instead of losing the draft. A `beforeunload` listener
// (wired up by the caller via the returned `beforeunload` handler) covers the
// separate case of an actual tab close/refresh, which beforeNavigate can't see.
//
// Navigations of type 'leave' (the browser navigating away from the app
// entirely) are left alone here — cancelling those ourselves would fight with
// the native beforeunload prompt instead of deferring to it.
export function createDirtyGuard(isDirty: () => boolean) {
	let open = $state(false);
	let pending: { url: URL; type: BeforeNavigate['type']; delta: number | null } | null = null;
	// Set right before the confirmed navigation below, so that call's own
	// beforeNavigate re-entry (isDirty() is still true at that point — nothing
	// has cleared the draft yet) doesn't intercept and cancel itself.
	let bypassNext = false;

	beforeNavigate((navigation) => {
		if (bypassNext) {
			bypassNext = false;
			return;
		}
		if (navigation.type === 'leave' || !isDirty()) return;
		navigation.cancel();
		// Re-cancels and refreshes the target on every attempt while the prompt
		// is already open too — e.g. pressing Back a second time (the back link
		// stays focused, so a stray Enter re-fires it) must not fall through
		// uncancelled just because an earlier attempt already opened the dialog.
		if (navigation.to) {
			pending = {
				url: navigation.to.url,
				type: navigation.type,
				delta: navigation.type === 'popstate' ? navigation.delta : null
			};
		}
		open = true;
	});

	function confirmDiscard() {
		open = false;
		const target = pending;
		pending = null;
		if (!target) return;
		bypassNext = true;
		if (target.type === 'popstate' && target.delta !== null) {
			// Re-issues the same back/forward traversal instead of goto()'s
			// pushState — a push would leave this page's history entry on the
			// stack (the next Back lands right back on it) and skip the
			// popstate-only scroll restoration this app relies on elsewhere
			// (see nav-direction.ts).
			window.history.go(target.delta);
			return;
		}
		// target.url is SvelteKit's own already-resolved navigation target
		// (from the beforeNavigate callback above), not a statically-checkable
		// literal — same situation as +layout.svelte's HA sign-in redirect.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(target.url);
	}

	function cancelDiscard() {
		open = false;
		pending = null;
	}

	function beforeunload(event: BeforeUnloadEvent) {
		if (!isDirty()) return;
		event.preventDefault();
		event.returnValue = '';
	}

	return {
		get open() {
			return open;
		},
		confirmDiscard,
		cancelDiscard,
		beforeunload
	};
}
