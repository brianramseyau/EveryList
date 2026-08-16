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
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 5, clientY: 0 });

		expect(node.style.transform).toBe('');
	});

	it('translates the row leftward once a horizontal swipe is detected', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });

		expect(node.style.transform).toBe('translateX(-30px)');
		expect(node.setPointerCapture).toHaveBeenCalledWith(1);
	});

	it('clamps the translation at REVEAL_PX', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -(REVEAL_PX + 50), clientY: 0 });

		expect(node.style.transform).toBe(`translateX(${-REVEAL_PX}px)`);
	});

	it('translates the row rightward too, revealing the mirrored panel', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 30, clientY: 0 });

		expect(node.style.transform).toBe('translateX(30px)');
		expect(node.setPointerCapture).toHaveBeenCalledWith(1);
	});

	it('clamps rightward translation at REVEAL_PX', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 30, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: REVEAL_PX + 50, clientY: 0 });

		expect(node.style.transform).toBe(`translateX(${REVEAL_PX}px)`);
	});

	it('fires onCommitRight when released rightward past the commit threshold', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		const past = Math.ceil(REVEAL_PX * COMMIT_RATIO) + 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: past, clientY: 0 });

		expect(onCommitRight).toHaveBeenCalledOnce();
		expect(onCommitLeft).not.toHaveBeenCalled();
	});

	it('fires onCommitLeft when released leftward past the commit threshold', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		const past = -Math.ceil(REVEAL_PX * COMMIT_RATIO) - 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: past, clientY: 0 });

		expect(onCommitLeft).toHaveBeenCalledOnce();
		expect(onCommitRight).not.toHaveBeenCalled();
	});

	it('releases tracking when the initial movement is vertical-dominant, leaving scroll native', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 5, clientY: 30 });
		firePointer(node, 'pointermove', { clientX: -50, clientY: 30 });

		expect(node.style.transform).toBe('');
		expect(node.setPointerCapture).not.toHaveBeenCalled();
	});

	it('snaps back without committing when released short of the commit threshold', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -20, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: -20, clientY: 0 });

		expect(onCommitLeft).not.toHaveBeenCalled();
		expect(onCommitRight).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('does not commit on pointercancel even past the commit threshold, but still resets', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		const past = -Math.ceil(REVEAL_PX * COMMIT_RATIO) - 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointercancel', { clientX: past, clientY: 0 });

		expect(onCommitLeft).not.toHaveBeenCalled();
		expect(onCommitRight).not.toHaveBeenCalled();
		expect(node.style.transform).toBe('');
	});

	it('ignores pointerdown while disabled', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { disabled: true, onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });

		expect(node.style.transform).toBe('');
	});

	it('ignores events from an unrelated pointer id', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		swipeReveal(node, { onCommitRight, onCommitLeft });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0, pointerId: 1 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0, pointerId: 2 });

		expect(node.style.transform).toBe('');
	});

	it('picks up updated params via update()', () => {
		const onCommitLeftA = vi.fn();
		const onCommitLeftB = vi.fn();
		const action = swipeReveal(node, {
			onCommitRight: vi.fn(),
			onCommitLeft: onCommitLeftA
		});
		action.update({ onCommitRight: vi.fn(), onCommitLeft: onCommitLeftB });

		const past = -Math.ceil(REVEAL_PX * COMMIT_RATIO) - 5;
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: past, clientY: 0 });
		firePointer(node, 'pointerup', { clientX: past, clientY: 0 });

		expect(onCommitLeftA).not.toHaveBeenCalled();
		expect(onCommitLeftB).toHaveBeenCalledOnce();
	});

	it('removes its listeners on destroy', () => {
		const onCommitRight = vi.fn();
		const onCommitLeft = vi.fn();
		const action = swipeReveal(node, { onCommitRight, onCommitLeft });

		action.destroy();
		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: -30, clientY: 0 });

		expect(node.style.transform).toBe('');
	});
});
