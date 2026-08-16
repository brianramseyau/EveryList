// Press-and-hold drag-and-drop reorder (PHASE9_PLAN.md #7) — hand-rolled on
// the Pointer Events API rather than a DnD library, to stay inside the
// bundle-size budget Phase 7 fought for.
//
// This is a "commit on drop" design, not a live one: dragging never touches
// the caller's real item array mid-gesture. Instead the dragged row free-
// follows the pointer via its own transform, sibling rows shift by one row-
// height to open a visual gap at the current target index, and the actual
// reorder callback fires exactly once, on release. An earlier version
// mutated the bound array on every index crossed, which fed back into
// `getItemRects()`'s live DOM query (rows re-render mid-gesture, so
// positions genuinely moved under the pointer) and only ever advanced one
// step per gesture in practice — this version captures row rects once, at
// drag start, and never re-measures, so the gesture math is a pure function
// of the pointer's position relative to a fixed layout snapshot.
//
// Triggers on the whole row (long-press anywhere), not a dedicated handle —
// exclude specific descendants (e.g. a row's own checkbox) by marking them
// `data-reorder-ignore`.
//
// `indexForPointerY`/`gapOffsetPx` are pure and kept separate from the DOM-
// wiring action so the reorder math is exhaustively unit-testable without
// any real pointer-event machinery (see PHASE9_PLAN.md's coverage-gate risk
// note).

export const HOLD_MS = 400;
const MOVE_CANCEL_THRESHOLD_PX = 10;

/** Given a pointer's Y position and the drag-start bounding rects of every
 * row (in visual order), returns the insertion index the dragged row would
 * land at — compared against each rect's vertical midpoint. */
export function indexForPointerY(pointerY: number, rects: readonly DOMRect[]): number {
	for (let i = 0; i < rects.length; i++) {
		const midpoint = rects[i]!.top + rects[i]!.height / 2;
		if (pointerY < midpoint) return i;
	}
	return rects.length;
}

/** An insertion-point index (0..rows.length, as returned by
 * `indexForPointerY`) collapses to a same-array-length "final index" once
 * the dragged row is removed from in front of it — mirrors `Array.splice`'s
 * own index shift. */
export function finalIndexForInsertionPoint(insertionIndex: number, fromIndex: number): number {
	return insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;
}

/** Vertical offset (px) for a sibling row (identified by its drag-start
 * index) so the list visually opens a gap at `toIndex` while the dragged
 * row itself is excluded (it free-follows the pointer instead). */
export function gapOffsetPx(
	rowIndex: number,
	fromIndex: number,
	toIndex: number,
	rowHeightPx: number
): number {
	if (rowIndex === fromIndex) return 0;
	if (toIndex > fromIndex) return rowIndex > fromIndex && rowIndex <= toIndex ? -rowHeightPx : 0;
	if (toIndex < fromIndex) return rowIndex >= toIndex && rowIndex < fromIndex ? rowHeightPx : 0;
	return 0;
}

export interface PressHoldReorderParams {
	/** This row's current index within `getRowEls()`'s list. */
	index: number;
	disabled?: boolean;
	getRowEls: () => HTMLElement[];
	/** Fired once, the moment the hold delay elapses and dragging begins. */
	onstart?: (fromIndex: number) => void;
	/** Fired as the drag crosses into a new target index. */
	onhover?: (toIndex: number) => void;
	/** Fired once on release, only if the index actually changed. */
	ondrop: (fromIndex: number, toIndex: number) => void;
}

export function pressHoldReorder(node: HTMLElement, params: PressHoldReorderParams) {
	let current = params;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let dragging = false;
	let startX = 0;
	let startY = 0;
	let pointerId: number | null = null;
	let rows: HTMLElement[] = [];
	let rects: DOMRect[] = [];
	let fromIndex = 0;
	let targetIndex = 0;
	let rowHeight = 0;

	function clearHoldTimer() {
		if (holdTimer === undefined) return;
		clearTimeout(holdTimer);
		holdTimer = undefined;
	}

	function applyGap() {
		for (let i = 0; i < rows.length; i++) {
			if (i === fromIndex) continue;
			const offset = gapOffsetPx(i, fromIndex, targetIndex, rowHeight);
			rows[i]!.style.transform = offset === 0 ? '' : `translateY(${offset}px)`;
			rows[i]!.style.transition = 'transform 120ms ease';
		}
	}

	function clearRowStyles() {
		for (const row of rows) {
			row.style.transform = '';
			row.style.transition = '';
		}
		node.style.transform = '';
		node.style.transition = '';
		node.style.zIndex = '';
		node.style.boxShadow = '';
		node.style.position = '';
		node.style.touchAction = '';
	}

	function startDragging() {
		holdTimer = undefined;
		dragging = true;
		rows = current.getRowEls();
		rects = rows.map((row) => row.getBoundingClientRect());
		fromIndex = current.index;
		targetIndex = fromIndex;
		rowHeight = rects[fromIndex]?.height ?? 0;
		// pointerId is always set by handlePointerDown before this timer can
		// fire — the null case isn't reachable through the gesture itself.
		/* v8 ignore next */
		if (pointerId !== null) node.setPointerCapture(pointerId);
		// Lock out native scroll now, before any touchmove has been seen (the
		// pre-hold 10px slop check guarantees none has) — a descendant row's
		// own `touch-action: pan-y` (for swipe-to-reveal) can't loosen this,
		// since the effective touch-action is the intersection with ancestors.
		node.style.touchAction = 'none';
		node.style.position = 'relative';
		node.style.zIndex = '20';
		node.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.25)';
		node.classList.add('is-dragging');
		current.onstart?.(fromIndex);
	}

	function handlePointerDown(event: PointerEvent) {
		if (current.disabled || event.button !== 0) return;
		if ((event.target as HTMLElement | null)?.closest('[data-reorder-ignore]')) return;
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
			// Real scroll/tap/swipe gestures move before the hold fires —
			// cancel rather than let one accidentally arm a drag.
			if (dx > MOVE_CANCEL_THRESHOLD_PX || dy > MOVE_CANCEL_THRESHOLD_PX) clearHoldTimer();
			return;
		}
		node.style.transform = `translateY(${event.clientY - startY}px)`;

		const insertionIndex = indexForPointerY(event.clientY, rects);
		const next = finalIndexForInsertionPoint(insertionIndex, fromIndex);
		if (next !== targetIndex) {
			targetIndex = next;
			applyGap();
			current.onhover?.(targetIndex);
		}
	}

	function endDrag() {
		clearHoldTimer();
		if (dragging) {
			dragging = false;
			node.classList.remove('is-dragging');
			// pointerId is always set by handlePointerDown by the time dragging
			// is true — the null case isn't reachable through the gesture itself.
			/* v8 ignore next */
			if (pointerId !== null) node.releasePointerCapture(pointerId);
			clearRowStyles();
			if (targetIndex !== fromIndex) current.ondrop(fromIndex, targetIndex);
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
