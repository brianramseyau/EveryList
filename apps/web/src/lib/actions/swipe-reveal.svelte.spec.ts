import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_RATIO, REVEAL_PX, swipeReveal } from './swipe-reveal';

function firePointer(
	node: HTMLElement,
	type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
	init: Partial<PointerEvent> = {}
) {
	node.dispatchEvent(
		new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 0, clientY: 0, ...init })
	);
}

describe('swipeReveal', () => {
	let node: HTMLElement;

	beforeEach(() => {
		node = document.createElement('li');
		node.setPointerCapture = vi.fn();
		node.releasePointerCapture = vi.fn();
		node.hasPointerCapture = vi.fn(() => true);
		document.body.append(node);
	});

	afterEach(() => {
		node.remove();
	});

	it('does not track movement below the direction dead zone', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 5, clientY: 0 });

		expect(node.style.transform).toBe('');
	});

	it('translates the row leftward once a horizontal swipe is detected', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });

		expect(node.style.transform).toBe('translateX(-30px)');
		expect(node.setPointerCapture).toHaveBeenCalledWith(1);
	});

	it('clamps the translation at REVEAL_PX', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -(REVEAL_PX + 50), clientY: 0 });

		expect(node.style.transform).toBe(`translateX(${-REVEAL_PX}px)`);
	});

	it('never drags rightward past zero', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 30, clientY: 0 });

		expect(node.style.transform).toBe('translateX(0px)');
	});

	it('releases tracking when the initial movement is vertical-dominant, leaving scroll native', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 5, clientY: 30 });
		firePointer(node, 'pointermove', { clientX: -50, clientY: 30 });

		expect(node.style.transform).toBe('');
		expect(node.setPointerCapture).not.toHaveBeenCalled();
	});

	it('snaps back without deleting when released short of the commit threshold', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -20, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: -20, clientY: 0 });

		expect(ondelete).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('fires ondelete when released past the commit threshold', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		const past = -Math.ceil(REVEAL_PX * COMMIT_RATIO) - 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: past, clientY: 0 });

		expect(ondelete).toHaveBeenCalledOnce();
	});

	it('does not delete on pointercancel even past the commit threshold, but still resets', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		const past = -Math.ceil(REVEAL_PX * COMMIT_RATIO) - 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointercancel', { clientX: past, clientY: 0 });

		expect(ondelete).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('ignores pointerdown while disabled', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { disabled: true, ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });

		expect(node.style.transform).toBe('');
	});

	it('ignores events from an unrelated pointer id', () => {
		const ondelete = vi.fn();
		swipeReveal(node, { ondelete });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0, pointerId: 2 });

		expect(node.style.transform).toBe('');
	});

	it('picks up updated params via update()', () => {
		const ondeleteA = vi.fn();
		const ondeleteB = vi.fn();
		const action = swipeReveal(node, { ondelete: ondeleteA });
		action.update({ ondelete: ondeleteB });

		const past = -Math.ceil(REVEAL_PX * COMMIT_RATIO) - 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: past, clientY: 0 });

		expect(ondeleteA).not.toHaveBeenCalled();
		expect(ondeleteB).toHaveBeenCalledOnce();
	});

	it('removes its listeners on destroy', () => {
		const ondelete = vi.fn();
		const action = swipeReveal(node, { ondelete });

		action.destroy();
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });

		expect(node.style.transform).toBe('');
	});
});
