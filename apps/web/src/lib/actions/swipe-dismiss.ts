// Hand-rolled vertical swipe-to-dismiss for the undo toast — a sibling of the
// swipe-reveal action (same pointer-events state machine, but vertical):
// dragging the toast downward past the commit threshold fires onDismiss;
// releasing short of it (or dragging up) snaps it back in place. No gesture
// library, driven by a small synchronously-testable state machine reading
// synthetic PointerEvents.

export const DISMISS_PX = 80;
export const COMMIT_RATIO = 0.5;
const DIRECTION_DEAD_ZONE_PX = 10;

export interface SwipeDismissParams {
	onDismiss: () => void;
}

export function swipeDismiss(node: HTMLElement, params: SwipeDismissParams) {
	let current = params;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let dy = 0;
	let directionLocked = false;
	let dragging = false;

	function reset() {
		dragging = false;
		directionLocked = false;
		dy = 0;
		node.style.transform = '';
	}

	function handlePointerDown(event: PointerEvent) {
		// Non-primary mouse buttons (right/middle-click) aren't a swipe gesture.
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		dy = 0;
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
			if (Math.abs(moveX) > Math.abs(moveY)) {
				// Horizontal intent — not a dismiss gesture. Drop tracking.
				pointerId = null;
				return;
			}
			dragging = true;
			node.setPointerCapture(event.pointerId);
		}
		/* v8 ignore next */
		if (!dragging) return;

		// Only downward movement counts — dragging up never dismisses.
		dy = Math.min(DISMISS_PX, Math.max(0, moveY));
		node.style.transform = `translateY(${dy}px)`;
	}

	function handlePointerEnd(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;
		if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
		pointerId = null;

		// A cancel (e.g. the browser interrupting the gesture for its own UI)
		// never commits — only a clean release past the threshold does.
		const shouldDismiss = event.type === 'pointerup' && dragging && dy >= DISMISS_PX * COMMIT_RATIO;
		reset();
		if (shouldDismiss) current.onDismiss();
	}

	node.addEventListener('pointerdown', handlePointerDown);
	node.addEventListener('pointermove', handlePointerMove);
	node.addEventListener('pointerup', handlePointerEnd);
	node.addEventListener('pointercancel', handlePointerEnd);

	return {
		update(next: SwipeDismissParams) {
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
