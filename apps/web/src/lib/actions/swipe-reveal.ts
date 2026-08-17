// Hand-rolled directional swipe via Pointer Events (PHASE9_PLAN.md #9,
// PHASE10_PLAN.md #0.9) — no gesture library, driven by a small
// synchronously-testable state machine reading synthetic PointerEvents.
// Swipe right commits onCommitRight (delete); swipe left commits
// onCommitLeft (edit).

export const REVEAL_PX = 80;
export const COMMIT_RATIO = 0.5;
const DIRECTION_DEAD_ZONE_PX = 10;

export interface SwipeRevealParams {
	disabled?: boolean;
	onCommitRight: () => void;
	onCommitLeft: () => void;
}

export function swipeReveal(node: HTMLElement, params: SwipeRevealParams) {
	let current = params;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let dx = 0;
	let directionLocked = false;
	let dragging = false;

	function reset() {
		dragging = false;
		directionLocked = false;
		dx = 0;
		node.style.transform = '';
	}

	function handlePointerDown(event: PointerEvent) {
		if (current.disabled) return;
		// Non-primary mouse buttons (right/middle-click) aren't a swipe gesture.
		/* v8 ignore next */
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
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
		reset();
		if (shouldCommit) {
			if (committedRight) current.onCommitRight();
			else current.onCommitLeft();
		}
	}

	node.addEventListener('pointerdown', handlePointerDown);
	node.addEventListener('pointermove', handlePointerMove);
	node.addEventListener('pointerup', handlePointerEnd);
	node.addEventListener('pointercancel', handlePointerEnd);

	return {
		update(next: SwipeRevealParams) {
			current = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', handlePointerDown);
			node.removeEventListener('pointermove', handlePointerMove);
			node.removeEventListener('pointerup', handlePointerEnd);
			node.removeEventListener('pointercancel', handlePointerEnd);
		}
	};
}
