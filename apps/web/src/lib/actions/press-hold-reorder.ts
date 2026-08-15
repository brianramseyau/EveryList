// Press-and-hold drag-and-drop reorder (PHASE9_PLAN.md #7) — hand-rolled on
// the Pointer Events API rather than a DnD library, to stay inside the
// bundle-size budget Phase 7 fought for. `indexForPointerY` is a pure
// function kept separate from the DOM-wiring action so the reorder math is
// exhaustively unit-testable without any real pointer-event machinery (see
// PHASE9_PLAN.md's coverage-gate risk note).

export const HOLD_MS = 400;
const MOVE_CANCEL_THRESHOLD_PX = 10;

/** Given a pointer's Y position and the current (in visual order) bounding
 * rects of every item in the list, returns the index the dragged item
 * should move to — compared against each rect's vertical midpoint. */
export function indexForPointerY(pointerY: number, rects: readonly DOMRect[]): number {
	for (let i = 0; i < rects.length; i++) {
		const midpoint = rects[i]!.top + rects[i]!.height / 2;
		if (pointerY < midpoint) return i;
	}
	return rects.length;
}

export interface PressHoldReorderParams {
	/** This item's current index within `getItemRects()`'s list. */
	index: number;
	disabled?: boolean;
	getItemRects: () => DOMRect[];
	/** Fired once, the moment the hold delay elapses and dragging begins. */
	onstart?: (fromIndex: number) => void;
	/** Fired as the drag crosses into a new target index. */
	onmove: (toIndex: number, clientX: number, clientY: number) => void;
	/** Fired once on release, only if the index actually changed. */
	ondrop: (fromIndex: number, toIndex: number, clientX: number, clientY: number) => void;
}

export function pressHoldReorder(node: HTMLElement, params: PressHoldReorderParams) {
	let current = params;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let dragging = false;
	let startX = 0;
	let startY = 0;
	let fromIndex = current.index;
	let toIndex = current.index;
	let pointerId: number | null = null;

	function clearHoldTimer() {
		if (holdTimer === undefined) return;
		clearTimeout(holdTimer);
		holdTimer = undefined;
	}

	function startDragging() {
		holdTimer = undefined;
		dragging = true;
		fromIndex = current.index;
		toIndex = current.index;
		// pointerId is always set by handlePointerDown before this timer can
		// fire — the null case isn't reachable through the gesture itself.
		/* v8 ignore next */
		if (pointerId !== null) node.setPointerCapture(pointerId);
		node.classList.add('is-dragging');
		current.onstart?.(fromIndex);
	}

	function handlePointerDown(event: PointerEvent) {
		if (current.disabled || event.button !== 0) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		clearHoldTimer();
		holdTimer = setTimeout(startDragging, HOLD_MS);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragging) {
			if (holdTimer === undefined) return;
			const dx = Math.abs(event.clientX - startX);
			const dy = Math.abs(event.clientY - startY);
			// Real scroll/tap gestures move before the hold fires — cancel
			// rather than let a scroll accidentally arm a drag.
			if (dx > MOVE_CANCEL_THRESHOLD_PX || dy > MOVE_CANCEL_THRESHOLD_PX) clearHoldTimer();
			return;
		}
		const next = indexForPointerY(event.clientY, current.getItemRects());
		if (next !== toIndex) toIndex = next;
		current.onmove(toIndex, event.clientX, event.clientY);
	}

	function endDrag(event: PointerEvent) {
		clearHoldTimer();
		if (dragging) {
			dragging = false;
			node.classList.remove('is-dragging');
			// pointerId is always set by handlePointerDown by the time dragging
			// is true — the null case isn't reachable through the gesture itself.
			/* v8 ignore next */
			if (pointerId !== null) node.releasePointerCapture(pointerId);
			if (toIndex !== fromIndex) current.ondrop(fromIndex, toIndex, event.clientX, event.clientY);
		}
		pointerId = null;
	}

	node.addEventListener('pointerdown', handlePointerDown);
	node.addEventListener('pointermove', handlePointerMove);
	node.addEventListener('pointerup', endDrag);
	node.addEventListener('pointercancel', endDrag);

	return {
		update(next: PressHoldReorderParams) {
			current = next;
		},
		destroy() {
			clearHoldTimer();
			node.removeEventListener('pointerdown', handlePointerDown);
			node.removeEventListener('pointermove', handlePointerMove);
			node.removeEventListener('pointerup', endDrag);
			node.removeEventListener('pointercancel', endDrag);
		}
	};
}
