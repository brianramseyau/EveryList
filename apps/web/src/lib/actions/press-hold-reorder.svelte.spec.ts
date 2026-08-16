import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	finalIndexForInsertionPoint,
	gapOffsetPx,
	HOLD_MS,
	indexForPointerY,
	pressHoldReorder
} from './press-hold-reorder';

function rect(top: number, height: number): DOMRect {
	return {
		top,
		height,
		bottom: top + height,
		left: 0,
		right: 0,
		width: 0,
		x: 0,
		y: top,
		toJSON() {
			return this;
		}
	} as DOMRect;
}

function rowEl(top: number, height: number): HTMLElement {
	const el = document.createElement('li');
	el.getBoundingClientRect = () => rect(top, height);
	return el;
}

describe('indexForPointerY', () => {
	it('returns 0 when the pointer is above every item', () => {
		const rects = [rect(0, 40), rect(40, 40), rect(80, 40)];
		expect(indexForPointerY(-10, rects)).toBe(0);
	});

	it('returns the list length when the pointer is below every item', () => {
		const rects = [rect(0, 40), rect(40, 40), rect(80, 40)];
		expect(indexForPointerY(200, rects)).toBe(3);
	});

	it('returns the index of the first item whose midpoint the pointer is above', () => {
		const rects = [rect(0, 40), rect(40, 40), rect(80, 40)];
		// Midpoints are at 20, 60, 100.
		expect(indexForPointerY(50, rects)).toBe(1);
		expect(indexForPointerY(90, rects)).toBe(2);
	});

	it('returns 0 for an empty list', () => {
		expect(indexForPointerY(50, [])).toBe(0);
	});
});

describe('finalIndexForInsertionPoint', () => {
	it('leaves an insertion point before the dragged row untouched', () => {
		expect(finalIndexForInsertionPoint(0, 2)).toBe(0);
	});

	it('shifts an insertion point after the dragged row back by one', () => {
		expect(finalIndexForInsertionPoint(3, 0)).toBe(2);
	});

	it('collapses onto itself when the insertion point is the dragged row', () => {
		expect(finalIndexForInsertionPoint(2, 2)).toBe(2);
	});
});

describe('gapOffsetPx', () => {
	const uniformRects = [rect(0, 40), rect(40, 40), rect(80, 40), rect(120, 40)];

	it('never offsets the dragged row itself', () => {
		expect(gapOffsetPx(1, 1, 3, uniformRects)).toBe(0);
	});

	it("lifts rows between the drag origin and a lower target up into their neighbor's slot", () => {
		expect(gapOffsetPx(2, 0, 3, uniformRects)).toBe(-40);
		expect(gapOffsetPx(3, 0, 3, uniformRects)).toBe(-40);
	});

	it('leaves rows outside that range alone when dragging down', () => {
		expect(gapOffsetPx(0, 1, 3, uniformRects)).toBe(0);
		// Row 4 doesn't exist in uniformRects, but it's outside the shifted
		// range so its offset is 0 without ever indexing into rects.
		expect(gapOffsetPx(4, 1, 3, uniformRects)).toBe(0);
	});

	it("drops rows between a higher target and the drag origin down into their neighbor's slot", () => {
		expect(gapOffsetPx(1, 3, 1, uniformRects)).toBe(40);
		expect(gapOffsetPx(2, 3, 1, uniformRects)).toBe(40);
	});

	it('is a no-op when the target equals the origin', () => {
		expect(gapOffsetPx(2, 1, 1, uniformRects)).toBe(0);
	});

	it('accounts for uneven gaps between rows, e.g. a category heading sitting between two of them', () => {
		// Row 1 sits 90px below row 0 instead of the uniform 40px — as if a
		// category heading (and its margins) occupies the extra 50px between
		// them. Dragging row 0 down past row 1 must shift row 1 up by the
		// full real distance to its old slot, not a flat row height, or it
		// lands overlapping the heading instead of clearing it.
		const unevenRects = [rect(0, 40), rect(90, 40), rect(130, 40)];
		expect(gapOffsetPx(1, 0, 2, unevenRects)).toBe(-90);
	});
});

function firePointer(
	node: HTMLElement,
	type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
	init: Partial<PointerEvent> = {}
) {
	node.dispatchEvent(
		new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 0, clientY: 0, ...init })
	);
}

describe('pressHoldReorder', () => {
	let node: HTMLElement;

	beforeEach(() => {
		vi.useFakeTimers();
		node = document.createElement('li');
		document.body.append(node);
	});

	afterEach(() => {
		vi.useRealTimers();
		node.remove();
	});

	it('does not start dragging before the hold delay elapses', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS - 50);
		firePointer(node, 'pointermove', { clientY: 100 });

		expect(onhover).not.toHaveBeenCalled();
	});

	it('tolerates tiny movement below the cancel threshold while the hold is still pending', () => {
		const onstart = vi.fn();
		pressHoldReorder(node, {
			index: 0,
			getRowEls: () => [],
			onstart,
			onhover: vi.fn(),
			ondrop: vi.fn()
		});

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 3, clientY: 3 });
		vi.advanceTimersByTime(HOLD_MS);

		expect(onstart).toHaveBeenCalledOnce();
	});

	it('ignores pointerdown that starts on a data-reorder-ignore descendant', () => {
		const onstart = vi.fn();
		const child = document.createElement('button');
		child.setAttribute('data-reorder-ignore', '');
		node.append(child);
		pressHoldReorder(node, { index: 0, getRowEls: () => [], onstart, ondrop: vi.fn() });

		firePointer(child, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);

		expect(onstart).not.toHaveBeenCalled();
	});

	it('starts dragging once the hold delay elapses, lifts the row, and reports hovered index changes', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		const rows = [rowEl(0, 40), rowEl(40, 40), rowEl(80, 40)];
		pressHoldReorder(node, { index: 0, getRowEls: () => rows, onhover, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		expect(node.classList.contains('is-dragging')).toBe(true);

		firePointer(node, 'pointermove', { clientY: 90 });

		// clientY 90 is past the 3rd row's midpoint (100), giving an
		// insertion point of 2 — one less once the dragged row (index 0) is
		// accounted for, landing at final index 1.
		expect(onhover).toHaveBeenCalledWith(1);
		expect(node.style.transform).toBe('translateY(90px)');
	});

	it('opens a gap by shifting sibling rows out of the way, excluding the dragged one', () => {
		const rows = [rowEl(0, 40), rowEl(40, 40), rowEl(80, 40)];
		pressHoldReorder(node, { index: 0, getRowEls: () => rows, ondrop: vi.fn() });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(rows[0]!.style.transform).toBe('');
		expect(rows[1]!.style.transform).toBe('translateY(-40px)');
		expect(rows[2]!.style.transform).toBe('');
	});

	it('fires onstart once, with the original index, the moment dragging begins', () => {
		const onstart = vi.fn();
		pressHoldReorder(node, {
			index: 2,
			getRowEls: () => [],
			onstart,
			onhover: vi.fn(),
			ondrop: vi.fn()
		});

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);

		expect(onstart).toHaveBeenCalledExactlyOnceWith(2);
	});

	it('cancels the hold on horizontal movement past the threshold before it elapses', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 20, clientY: 0 });
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientX: 90, clientY: 0 });

		expect(onhover).not.toHaveBeenCalled();
	});

	it('cancels the hold if the pointer moves past the threshold before it elapses (a scroll, not a hold)', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown', { clientY: 0 });
		firePointer(node, 'pointermove', { clientY: 20 });
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onhover).not.toHaveBeenCalled();
	});

	it('fires ondrop with the final index once released, only if it changed, and clears row styles', () => {
		const ondrop = vi.fn();
		const rows = [rowEl(0, 40), rowEl(40, 40), rowEl(80, 40)];
		pressHoldReorder(node, { index: 0, getRowEls: () => rows, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });
		firePointer(node, 'pointerup', { clientY: 90 });

		expect(ondrop).toHaveBeenCalledWith(0, 1);
		expect(node.style.transform).toBe('');
		expect(rows[1]!.style.transform).toBe('');
		expect(rows[2]!.style.transform).toBe('');
	});

	it('does not fire ondrop when the index never changed', () => {
		const ondrop = vi.fn();
		const rows = [rowEl(0, 40), rowEl(40, 40)];
		pressHoldReorder(node, { index: 0, getRowEls: () => rows, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		// Pointer stays over the same (first) slot.
		firePointer(node, 'pointermove', { clientY: 10 });
		firePointer(node, 'pointerup', { clientY: 10 });

		expect(ondrop).not.toHaveBeenCalled();
	});

	it('cancels the pending hold on pointerup before it elapses', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown');
		firePointer(node, 'pointerup');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onhover).not.toHaveBeenCalled();
		expect(ondrop).not.toHaveBeenCalled();
	});

	it('ends the drag on pointercancel, still firing ondrop for an in-progress move', () => {
		const ondrop = vi.fn();
		const rows = [rowEl(0, 40), rowEl(40, 40)];
		pressHoldReorder(node, { index: 0, getRowEls: () => rows, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 70 });
		firePointer(node, 'pointercancel', { clientY: 70 });

		expect(ondrop).toHaveBeenCalledWith(0, 1);
	});

	it('ignores a non-primary pointer button', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown', { button: 2 });
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onhover).not.toHaveBeenCalled();
	});

	it('does nothing on pointerdown while disabled', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, disabled: true, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onhover).not.toHaveBeenCalled();
	});

	it('picks up updated params via update()', () => {
		const onhoverA = vi.fn();
		const onhoverB = vi.fn();
		const rows = [rowEl(0, 40), rowEl(40, 40)];
		const action = pressHoldReorder(node, {
			index: 0,
			getRowEls: () => rows,
			onhover: onhoverA,
			ondrop: vi.fn()
		});
		action.update({ index: 0, getRowEls: () => rows, onhover: onhoverB, ondrop: vi.fn() });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 70 });

		expect(onhoverA).not.toHaveBeenCalled();
		expect(onhoverB).toHaveBeenCalled();
	});

	it('removes its listeners on destroy', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		const action = pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		action.destroy();
		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onhover).not.toHaveBeenCalled();
	});

	it('clears a pending hold timer on destroy', () => {
		const onhover = vi.fn();
		const ondrop = vi.fn();
		const action = pressHoldReorder(node, { index: 0, getRowEls: () => [], onhover, ondrop });

		firePointer(node, 'pointerdown');
		action.destroy();
		vi.advanceTimersByTime(HOLD_MS);

		// Should not throw and should not have started dragging.
		expect(node.classList.contains('is-dragging')).toBe(false);
	});
});
