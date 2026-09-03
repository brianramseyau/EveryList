import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_RATIO, DISMISS_PX, swipeDismiss } from './swipe-dismiss';

function firePointer(
	node: HTMLElement,
	type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
	init: Partial<PointerEvent> = {}
) {
	node.dispatchEvent(
		new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 0, clientY: 0, ...init })
	);
}

describe('swipeDismiss', () => {
	let node: HTMLElement;

	beforeEach(() => {
		node = document.createElement('div');
		node.setPointerCapture = vi.fn();
		node.releasePointerCapture = vi.fn();
		node.hasPointerCapture = vi.fn(() => true);
		document.body.append(node);
	});

	afterEach(() => {
		node.remove();
	});

	it('does not track movement below the direction dead zone', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 5 });

		expect(node.style.transform).toBe('');
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('translates the toast downward once a vertical downward swipe is detected', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 30 });

		expect(node.style.transform).toBe('translateY(30px)');
		expect(node.setPointerCapture).toHaveBeenCalledWith(1);
	});

	it('clamps the downward translation at DISMISS_PX', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 30 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: DISMISS_PX + 50 });

		expect(node.style.transform).toBe(`translateY(${DISMISS_PX}px)`);
	});

	it('never translates upward — only downward movement drags the toast', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 40 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 10 });

		expect(node.style.transform).toBe('translateY(0px)');
	});

	it('fires onDismiss when released downward past the commit threshold', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		const past = Math.ceil(DISMISS_PX * COMMIT_RATIO) + 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: past });
		firePointer(node, 'pointerup', { clientX: 0, clientY: past });

		expect(onDismiss).toHaveBeenCalledOnce();
		expect(node.releasePointerCapture).toHaveBeenCalledWith(1);
	});

	it('snaps back without dismissing when released short of the commit threshold', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 20 });
		firePointer(node, 'pointerup', { clientX: 0, clientY: 20 });

		expect(onDismiss).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('releases tracking when the initial movement is horizontal-dominant, leaving the toast alone', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 30, clientY: 15 });
		firePointer(node, 'pointermove', { clientX: 50, clientY: 40 });

		expect(node.style.transform).toBe('');
		expect(node.setPointerCapture).not.toHaveBeenCalled();
	});

	it('does not dismiss on pointercancel even past the commit threshold, but still resets', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		const past = Math.ceil(DISMISS_PX * COMMIT_RATIO) + 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: past });
		firePointer(node, 'pointercancel', { clientX: 0, clientY: past });

		expect(onDismiss).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('a plain tap — down then up with no movement — does not dismiss', () => {
		const onDismiss = vi.fn();
		node.hasPointerCapture = vi.fn(() => false);
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: 0, clientY: 0 });

		expect(onDismiss).not.toHaveBeenCalled();
		expect(node.releasePointerCapture).not.toHaveBeenCalled();
	});

	it('ignores events from an unrelated pointer id', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 30, pointerId: 2 });
		firePointer(node, 'pointerup', { clientX: 0, clientY: 30, pointerId: 2 });

		expect(node.style.transform).toBe('');
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('ignores a non-primary mouse button press', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', {
			clientX: 0,
			clientY: 0,
			pointerType: 'mouse',
			button: 1
		});
		firePointer(node, 'pointermove', { clientX: 0, clientY: 30 });

		expect(node.style.transform).toBe('');
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('tracks a primary-button mouse drag like any other pointer', () => {
		const onDismiss = vi.fn();
		swipeDismiss(node, { onDismiss });

		firePointer(node, 'pointerdown', {
			clientX: 0,
			clientY: 0,
			pointerType: 'mouse',
			button: 0
		});
		firePointer(node, 'pointermove', { clientX: 0, clientY: 30 });
		firePointer(node, 'pointerup', { clientX: 0, clientY: 30 });

		expect(node.style.transform).toBe('');
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('picks up updated params via update()', () => {
		const onDismissA = vi.fn();
		const onDismissB = vi.fn();
		const action = swipeDismiss(node, { onDismiss: onDismissA });
		action.update({ onDismiss: onDismissB });

		const past = Math.ceil(DISMISS_PX * COMMIT_RATIO) + 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: past });
		firePointer(node, 'pointerup', { clientX: 0, clientY: past });

		expect(onDismissA).not.toHaveBeenCalled();
		expect(onDismissB).toHaveBeenCalledOnce();
	});

	it('removes its listeners on destroy', () => {
		const onDismiss = vi.fn();
		const action = swipeDismiss(node, { onDismiss });

		action.destroy();
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 0, clientY: 30 });

		expect(node.style.transform).toBe('');
	});
});
