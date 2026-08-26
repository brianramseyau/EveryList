import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { longPress } from './long-press';

function firePointer(
	node: HTMLElement,
	type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
	init: Partial<PointerEvent> = {}
) {
	node.dispatchEvent(
		new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 0, clientY: 0, ...init })
	);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('longPress', () => {
	let node: HTMLElement;

	beforeEach(() => {
		node = document.createElement('button');
		document.body.append(node);
	});

	afterEach(() => {
		node.remove();
	});

	it('fires onLongPress after the default hold duration', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress });

		firePointer(node, 'pointerdown');
		await sleep(250);
		expect(onLongPress).not.toHaveBeenCalled();
		await sleep(350);
		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it('honors a custom duration', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 100 });

		firePointer(node, 'pointerdown');
		await sleep(60);
		expect(onLongPress).not.toHaveBeenCalled();
		await sleep(60);
		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it('does not fire on a release before the hold duration elapses', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50 });

		firePointer(node, 'pointerdown');
		await sleep(10);
		firePointer(node, 'pointerup');
		await sleep(80);

		expect(onLongPress).not.toHaveBeenCalled();
	});

	it('cancels the hold when the pointer drifts past the default move threshold', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50 });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		firePointer(node, 'pointermove', { clientX: 11, clientY: 0 });
		await sleep(80);

		expect(onLongPress).not.toHaveBeenCalled();
	});

	it('does not cancel the hold when the drift stays within a custom move threshold', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50, moveThreshold: 30 });

		firePointer(node, 'pointerdown', { clientX: 0, clientY: 0 });
		// 20px exceeds the default 10px threshold, but not this custom 30px one.
		firePointer(node, 'pointermove', { clientX: 20, clientY: 0 });
		await sleep(80);

		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it('does not fire on pointercancel', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50 });

		firePointer(node, 'pointerdown');
		firePointer(node, 'pointercancel');
		await sleep(80);

		expect(onLongPress).not.toHaveBeenCalled();
	});

	it('ignores pointerdown while disabled', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50, disabled: true });

		firePointer(node, 'pointerdown');
		await sleep(80);

		expect(onLongPress).not.toHaveBeenCalled();
	});

	it('ignores non-primary mouse buttons', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50 });

		firePointer(node, 'pointerdown', { pointerType: 'mouse', button: 2 });
		await sleep(80);

		expect(onLongPress).not.toHaveBeenCalled();
	});

	it('ignores movement from an unrelated pointer id', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50 });

		firePointer(node, 'pointerdown', { pointerId: 1 });
		firePointer(node, 'pointermove', { pointerId: 2, clientX: 50, clientY: 50 });
		await sleep(80);

		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it('ignores a release from an unrelated pointer id', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 50 });

		firePointer(node, 'pointerdown', { pointerId: 1 });
		firePointer(node, 'pointerup', { pointerId: 2 });
		await sleep(80);

		expect(onLongPress).toHaveBeenCalledOnce();
	});

	it('suppresses the click the browser synthesizes after a long press', async () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress, duration: 20 });

		firePointer(node, 'pointerdown');
		await sleep(40);
		expect(onLongPress).toHaveBeenCalledOnce();

		const bubbled = vi.fn();
		document.body.addEventListener('click', bubbled);
		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		node.dispatchEvent(click);
		document.body.removeEventListener('click', bubbled);

		expect(click.defaultPrevented).toBe(true);
		expect(bubbled).not.toHaveBeenCalled();
	});

	it('leaves a plain click alone when no long press fired', () => {
		const onLongPress = vi.fn();
		longPress(node, { onLongPress });

		firePointer(node, 'pointerdown');
		firePointer(node, 'pointerup');

		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		node.dispatchEvent(click);

		expect(click.defaultPrevented).toBe(false);
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it('picks up updated params via update()', async () => {
		const onLongPressA = vi.fn();
		const onLongPressB = vi.fn();
		const action = longPress(node, { onLongPress: onLongPressA, duration: 20 });
		action.update({ onLongPress: onLongPressB, duration: 20 });

		firePointer(node, 'pointerdown');
		await sleep(40);

		expect(onLongPressA).not.toHaveBeenCalled();
		expect(onLongPressB).toHaveBeenCalledOnce();
	});

	it('removes its listeners on destroy', async () => {
		const onLongPress = vi.fn();
		const action = longPress(node, { onLongPress, duration: 20 });

		action.destroy();
		firePointer(node, 'pointerdown');
		await sleep(40);

		expect(onLongPress).not.toHaveBeenCalled();
	});
});
