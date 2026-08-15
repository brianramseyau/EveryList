import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, indexForPointerY, pressHoldReorder } from './press-hold-reorder';

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
		const onmove = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS - 50);
		firePointer(node, 'pointermove', { clientY: 100 });

		expect(onmove).not.toHaveBeenCalled();
	});

	it('tolerates tiny movement below the cancel threshold while the hold is still pending', () => {
		const onstart = vi.fn();
		pressHoldReorder(node, {
			index: 0,
			getItemRects: () => [],
			onstart,
			onmove: vi.fn(),
			ondrop: vi.fn()
		});

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 3, clientY: 3 });
		vi.advanceTimersByTime(HOLD_MS);

		expect(onstart).toHaveBeenCalledOnce();
	});

	it('starts dragging once the hold delay elapses and reports moves via onmove', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		const rects = [rect(0, 40), rect(40, 40), rect(80, 40)];
		pressHoldReorder(node, { index: 0, getItemRects: () => rects, onmove, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onmove).toHaveBeenCalledWith(2, 0, 90);
	});

	it('fires onstart once, with the original index, the moment dragging begins', () => {
		const onstart = vi.fn();
		pressHoldReorder(node, {
			index: 2,
			getItemRects: () => [],
			onstart,
			onmove: vi.fn(),
			ondrop: vi.fn()
		});

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);

		expect(onstart).toHaveBeenCalledExactlyOnceWith(2);
	});

	it('cancels the hold on horizontal movement past the threshold before it elapses', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 20, clientY: 0 });
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientX: 90, clientY: 0 });

		expect(onmove).not.toHaveBeenCalled();
	});

	it('cancels the hold if the pointer moves past the threshold before it elapses (a scroll, not a hold)', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown', { clientY: 0 });
		firePointer(node, 'pointermove', { clientY: 20 });
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onmove).not.toHaveBeenCalled();
	});

	it('fires ondrop with the final index once released, only if it changed', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		const rects = [rect(0, 40), rect(40, 40), rect(80, 40)];
		pressHoldReorder(node, { index: 0, getItemRects: () => rects, onmove, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });
		firePointer(node, 'pointerup', { clientX: 5, clientY: 90 });

		expect(ondrop).toHaveBeenCalledWith(0, 2, 5, 90);
	});

	it('does not fire ondrop when the index never changed', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		const rects = [rect(0, 40), rect(40, 40)];
		pressHoldReorder(node, { index: 0, getItemRects: () => rects, onmove, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		// Pointer stays over the same (first) slot.
		firePointer(node, 'pointermove', { clientY: 10 });
		firePointer(node, 'pointerup', { clientY: 10 });

		expect(ondrop).not.toHaveBeenCalled();
	});

	it('cancels the pending hold on pointerup before it elapses', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown');
		firePointer(node, 'pointerup');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onmove).not.toHaveBeenCalled();
		expect(ondrop).not.toHaveBeenCalled();
	});

	it('ends the drag on pointercancel without firing ondrop for an in-progress but uncommitted move', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		const rects = [rect(0, 40), rect(40, 40)];
		pressHoldReorder(node, { index: 0, getItemRects: () => rects, onmove, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 50 });
		firePointer(node, 'pointercancel', { clientY: 50 });

		expect(ondrop).toHaveBeenCalledWith(0, 1, 0, 50);
	});

	it('ignores a non-primary pointer button', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown', { button: 2 });
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onmove).not.toHaveBeenCalled();
	});

	it('does nothing on pointerdown while disabled', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		pressHoldReorder(node, { index: 0, disabled: true, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onmove).not.toHaveBeenCalled();
	});

	it('picks up updated params via update()', () => {
		const onmoveA = vi.fn();
		const onmoveB = vi.fn();
		const rects = [rect(0, 40), rect(40, 40)];
		const action = pressHoldReorder(node, {
			index: 0,
			getItemRects: () => rects,
			onmove: onmoveA,
			ondrop: vi.fn()
		});
		action.update({ index: 0, getItemRects: () => rects, onmove: onmoveB, ondrop: vi.fn() });

		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 50 });

		expect(onmoveA).not.toHaveBeenCalled();
		expect(onmoveB).toHaveBeenCalled();
	});

	it('removes its listeners on destroy', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		const action = pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		action.destroy();
		firePointer(node, 'pointerdown');
		vi.advanceTimersByTime(HOLD_MS);
		firePointer(node, 'pointermove', { clientY: 90 });

		expect(onmove).not.toHaveBeenCalled();
	});

	it('clears a pending hold timer on destroy', () => {
		const onmove = vi.fn();
		const ondrop = vi.fn();
		const action = pressHoldReorder(node, { index: 0, getItemRects: () => [], onmove, ondrop });

		firePointer(node, 'pointerdown');
		action.destroy();
		vi.advanceTimersByTime(HOLD_MS);

		// Should not throw and should not have started dragging.
		expect(node.classList.contains('is-dragging')).toBe(false);
	});
});
