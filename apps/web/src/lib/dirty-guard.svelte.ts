import { beforeNavigate, goto } from '$app/navigation';

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
	let pendingUrl: URL | null = null;
	// Set right before the confirmed goto() below, so that call's own
	// beforeNavigate re-entry (isDirty() is still true at that point — nothing
	// has cleared the draft yet) doesn't intercept and cancel itself.
	let bypassNext = false;

	beforeNavigate((navigation) => {
		if (bypassNext) {
			bypassNext = false;
			return;
		}
		if (pendingUrl || navigation.type === 'leave' || !isDirty()) return;
		navigation.cancel();
		pendingUrl = navigation.to?.url ?? null;
		open = true;
	});

	function confirmDiscard() {
		open = false;
		const url = pendingUrl;
		pendingUrl = null;
		if (!url) return;
		bypassNext = true;
		// url is SvelteKit's own already-resolved navigation target (from the
		// beforeNavigate callback above), not a statically-checkable literal —
		// same situation as +layout.svelte's HA sign-in redirect.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url);
	}

	function cancelDiscard() {
		open = false;
		pendingUrl = null;
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
