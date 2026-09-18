import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeforeNavigate } from '@sveltejs/kit';

const beforeNavigateHandlers: Array<(navigation: BeforeNavigate) => void> = [];

vi.mock('$app/navigation', () => ({
	beforeNavigate: (handler: (navigation: BeforeNavigate) => void) => {
		beforeNavigateHandlers.push(handler);
	},
	goto: vi.fn()
}));

const { createDirtyGuard } = await import('./dirty-guard.svelte');
const { goto } = await import('$app/navigation');

function makeNavigation(overrides: {
	type: BeforeNavigate['type'];
	to: string | null;
	delta?: number;
}): BeforeNavigate {
	return {
		from: null,
		to: overrides.to ? { url: new URL(overrides.to) } : null,
		type: overrides.type,
		delta: overrides.type === 'popstate' ? (overrides.delta ?? -1) : undefined,
		willUnload: false,
		complete: Promise.resolve(),
		cancel: vi.fn()
	} as unknown as BeforeNavigate;
}

describe('createDirtyGuard', () => {
	beforeEach(() => {
		beforeNavigateHandlers.length = 0;
		vi.mocked(goto).mockClear();
	});

	it('leaves a clean navigation alone', () => {
		const guard = createDirtyGuard(() => false);
		const handler = beforeNavigateHandlers.at(-1)!;
		const navigation = makeNavigation({ type: 'link', to: 'http://x/lists' });

		handler(navigation);

		expect(navigation.cancel).not.toHaveBeenCalled();
		expect(guard.open).toBe(false);
	});

	it('ignores a leaving navigation so the native beforeunload prompt handles it instead', () => {
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		const navigation = makeNavigation({ type: 'leave', to: null });

		handler(navigation);

		expect(navigation.cancel).not.toHaveBeenCalled();
		expect(guard.open).toBe(false);
	});

	it('cancels a dirty in-app navigation and opens the confirm prompt', () => {
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		const navigation = makeNavigation({ type: 'link', to: 'http://x/lists' });

		handler(navigation);

		expect(navigation.cancel).toHaveBeenCalled();
		expect(guard.open).toBe(true);
	});

	it('still cancels a second navigation attempt while a prompt is already pending, and re-targets it', () => {
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		const first = makeNavigation({ type: 'link', to: 'http://x/lists' });
		handler(first);
		expect(first.cancel).toHaveBeenCalled();

		// e.g. the user presses Back a second time while the prompt is already open
		// (the back link stays focused, so a stray Enter re-fires it) — this must be
		// cancelled too, not let through just because an earlier attempt is pending.
		const second = makeNavigation({ type: 'link', to: 'http://x/other' });
		handler(second);

		expect(second.cancel).toHaveBeenCalled();
		expect(guard.open).toBe(true);

		guard.confirmDiscard();
		expect(goto).toHaveBeenCalledWith(new URL('http://x/other'));
	});

	it('opens the prompt for a dirty navigation with no resolved target', () => {
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		const navigation = makeNavigation({ type: 'popstate', to: null });

		handler(navigation);

		expect(navigation.cancel).toHaveBeenCalled();
		expect(guard.open).toBe(true);
	});

	it('cancelDiscard closes the prompt and leaves the draft in place', () => {
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		handler(makeNavigation({ type: 'link', to: 'http://x/lists' }));

		guard.cancelDiscard();

		expect(guard.open).toBe(false);
		expect(goto).not.toHaveBeenCalled();
	});

	it('confirmDiscard navigates to the pending target and re-arms for the next navigation', () => {
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		const targetUrl = 'http://x/lists';
		handler(makeNavigation({ type: 'link', to: targetUrl }));

		guard.confirmDiscard();

		expect(guard.open).toBe(false);
		expect(goto).toHaveBeenCalledWith(new URL(targetUrl));

		// The goto() call above re-enters beforeNavigate (SvelteKit calls it for every
		// navigation, including ones goto() itself triggers) — that re-entry must be let
		// through once, rather than being cancelled by the still-true isDirty().
		const reentrant = makeNavigation({ type: 'goto', to: targetUrl });
		handler(reentrant);
		expect(reentrant.cancel).not.toHaveBeenCalled();

		// A later, genuinely new navigation is guarded again.
		const later = makeNavigation({ type: 'link', to: 'http://x/other' });
		handler(later);
		expect(later.cancel).toHaveBeenCalled();
	});

	it('confirmDiscard re-issues a popstate as history.go(delta) instead of pushing via goto', () => {
		const historyGoSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {});
		const guard = createDirtyGuard(() => true);
		const handler = beforeNavigateHandlers.at(-1)!;
		handler(makeNavigation({ type: 'popstate', to: 'http://x/lists', delta: -1 }));

		guard.confirmDiscard();

		expect(historyGoSpy).toHaveBeenCalledWith(-1);
		expect(goto).not.toHaveBeenCalled();

		historyGoSpy.mockRestore();
	});

	it('confirmDiscard is a no-op when there is no pending navigation', () => {
		const guard = createDirtyGuard(() => false);

		guard.confirmDiscard();

		expect(goto).not.toHaveBeenCalled();
	});

	it('beforeunload only warns while dirty', () => {
		let dirty = false;
		const guard = createDirtyGuard(() => dirty);
		const clean = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
		guard.beforeunload(clean);
		expect(clean.preventDefault).not.toHaveBeenCalled();

		dirty = true;
		const dirtyEvent = { preventDefault: vi.fn(), returnValue: '' } as unknown as BeforeUnloadEvent;
		guard.beforeunload(dirtyEvent);
		expect(dirtyEvent.preventDefault).toHaveBeenCalled();
		expect(dirtyEvent.returnValue).toBe('');
	});
});
