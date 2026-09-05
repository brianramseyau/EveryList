// Hand-rolled directional swipe via Pointer Events (PLAN_09_PHASE_REFINEMENTS.md #9,
// PLAN_10_PHASE_VALIDATION_USABILITY.md #0.9) — no gesture library, driven by a small
// synchronously-testable state machine reading synthetic PointerEvents.
// Swipe right commits onCommitRight (delete); swipe left commits
// onCommitLeft (edit).

export const REVEAL_PX = 96;
// Committing requires dragging all the way to REVEAL_PX (a full swipe past
// where the panel is fully revealed), not just partway into it — a partial
// reveal was too easy to trigger by accident.
export const COMMIT_RATIO = 1;
const DIRECTION_DEAD_ZONE_PX = 10;
// Matches sortable-reorder's own `delay: 400` — a release inside this window
// without ever moving past the dead zone is a tap (toggle); holding past it
// hands off to that action's long-press-to-drag affordance instead, even if
// the hold never ends up moving anywhere.
const TAP_MAX_DURATION_MS = 400;

export interface SwipeRevealParams {
	disabled?: boolean;
	onCommitRight: () => void;
	onCommitLeft: () => void;
	/** Fired on a plain tap — pointerup with no directional movement, released
	 * inside TAP_MAX_DURATION_MS. Not fired for a tap that started on a
	 * `[data-reorder-ignore]` element (the checkbox, desktop edit/delete
	 * controls), since those already handle their own tap/click. */
	onTap?: () => void;
}

export function swipeReveal(node: HTMLElement, params: SwipeRevealParams) {
	let current = params;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let startTime = 0;
	let dx = 0;
	let directionLocked = false;
	let dragging = false;

	function reset() {
		pointerId = null;
		dragging = false;
		directionLocked = false;
		dx = 0;
		node.style.transform = '';
	}

	/** Stands the gesture down completely — used when the row gets disabled
	 * mid-hold (a sortable long-press drag arming), so the horizontal
	 * movement that follows the drag's activation can't reveal or commit the
	 * delete/edit panels. Only ever called with an active pointer (see
	 * update()), which reset() then clears. */
	function cancelTracking(pid: number) {
		if (node.hasPointerCapture(pid)) node.releasePointerCapture(pid);
		reset();
	}

	function handlePointerDown(event: PointerEvent) {
		if (current.disabled) return;
		// Non-primary mouse buttons (right/middle-click) aren't a swipe gesture.
		/* v8 ignore next */
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		// Elements with their own tap behavior opt out here, so a release on
		// them doesn't also fire onTap on top of their own handler.
		if ((event.target as HTMLElement).closest('[data-reorder-ignore]')) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		startTime = Date.now();
		dx = 0;
		dragging = false;
		directionLocked = false;
	}

	function handlePointerMove(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;
		const moveX = event.clientX - startX;
		const moveY = event.clientY - startY;

		if (!directionLocked) {
			if (Math.abs(moveX) < DIRECTION_DEAD_ZONE_PX && Math.abs(moveY) < DIRECTION_DEAD_ZONE_PX) {
				return;
			}
			directionLocked = true;
			if (Math.abs(moveX) <= Math.abs(moveY)) {
				// Vertical intent — hand the gesture back to native scroll
				// (touch-action: pan-y already permits it) by dropping tracking.
				pointerId = null;
				return;
			}
			dragging = true;
			node.setPointerCapture(event.pointerId);
		}
		/* v8 ignore next */
		if (!dragging) return;

		dx = Math.min(REVEAL_PX, Math.max(-REVEAL_PX, moveX));
		node.style.transform = `translateX(${dx}px)`;
	}

	function handlePointerEnd(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		pointerId = null;

		// A cancel (e.g. the browser interrupting the gesture for its own UI)
		// never commits — only a clean release past the threshold does. The
		// sign of dx at release picks which callback fires — see the two
		// distinct reveal panels in lists/[id]/+page.svelte.
		const shouldCommit =
			event.type === 'pointerup' && dragging && Math.abs(dx) >= REVEAL_PX * COMMIT_RATIO;
		const committedRight = dx > 0;
		const isTap =
			event.type === 'pointerup' &&
			!directionLocked &&
			Date.now() - startTime < TAP_MAX_DURATION_MS;
		reset();
		if (shouldCommit) {
			if (committedRight) current.onCommitRight();
			else current.onCommitLeft();
		} else if (isTap) {
			current.onTap?.();
		}
	}

	node.addEventListener('pointerdown', handlePointerDown);
	node.addEventListener('pointermove', handlePointerMove);
	node.addEventListener('pointerup', handlePointerEnd);
	node.addEventListener('pointercancel', handlePointerEnd);

	return {
		update(next: SwipeRevealParams) {
			current = next;
			// A long-press drag arming mid-hold (see sortable-reorder's
			// onDragStateChange) flips this action disabled while the pointer
			// is still down — cancel the tracking outright so the drag's own
			// horizontal movement can't reveal or commit the swipe panels.
			if (next.disabled && pointerId !== null) cancelTracking(pointerId);
		},
		destroy() {
			node.removeEventListener('pointerdown', handlePointerDown);
			node.removeEventListener('pointermove', handlePointerMove);
			node.removeEventListener('pointerup', handlePointerEnd);
			node.removeEventListener('pointercancel', handlePointerEnd);
		}
	};
}
