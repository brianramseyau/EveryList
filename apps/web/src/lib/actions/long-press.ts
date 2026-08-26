// Long-press gesture detection for a trigger element. Fires `onLongPress`
// after the pointer has been held down for `duration` ms without drifting
// more than `moveThreshold` px, then suppresses the `click` the browser
// synthesizes on release so a hold doesn't also activate the element's
// normal tap behavior (e.g. an `<a href>`'s navigation). The browser's own
// push-and-hold affordances (iOS touch-callout, Android context menu, text
// selection) still have to be disabled at the call site via CSS/contextmenu
// — this action only detects the gesture and swallows the follow-up click.

export interface LongPressParams {
	/** Hold time before onLongPress fires, in ms. */
	duration?: number;
	/** Movement (either axis, in px) that cancels the hold before it fires. */
	moveThreshold?: number;
	disabled?: boolean;
	onLongPress: () => void;
}

const DEFAULT_DURATION_MS = 400; // matches hold-to-drag's `delay: 400`
const DEFAULT_MOVE_THRESHOLD_PX = 10;

export function longPress(node: HTMLElement, params: LongPressParams) {
	let current = params;
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let didLongPress = false;

	function clearTimer() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	// Runs in the capture phase so it beats the element's own (and any
	// ancestor's) click handling, and swallows the click the browser fires
	// immediately after the held pointer is released.
	function suppressNextClick(event: Event) {
		if (!didLongPress) return;
		didLongPress = false;
		event.preventDefault();
		event.stopPropagation();
	}

	function handlePointerDown(event: PointerEvent) {
		if (current.disabled) return;
		// Non-primary mouse buttons (right/middle-click) aren't a hold gesture.
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		didLongPress = false;
		clearTimer();
		timer = setTimeout(() => {
			timer = null;
			didLongPress = true;
			current.onLongPress();
		}, current.duration ?? DEFAULT_DURATION_MS);
	}

	function handlePointerMove(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;
		const threshold = current.moveThreshold ?? DEFAULT_MOVE_THRESHOLD_PX;
		if (
			Math.abs(event.clientX - startX) > threshold ||
			Math.abs(event.clientY - startY) > threshold
		) {
			clearTimer();
			pointerId = null;
		}
	}

	function handlePointerEnd(event: PointerEvent) {
		if (pointerId === null || event.pointerId !== pointerId) return;
		pointerId = null;
		clearTimer();
	}

	node.addEventListener('pointerdown', handlePointerDown);
	node.addEventListener('pointermove', handlePointerMove);
	node.addEventListener('pointerup', handlePointerEnd);
	node.addEventListener('pointercancel', handlePointerEnd);
	node.addEventListener('click', suppressNextClick, true);

	return {
		update(next: LongPressParams) {
			current = next;
		},
		destroy() {
			clearTimer();
			node.removeEventListener('pointerdown', handlePointerDown);
			node.removeEventListener('pointermove', handlePointerMove);
			node.removeEventListener('pointerup', handlePointerEnd);
			node.removeEventListener('pointercancel', handlePointerEnd);
			node.removeEventListener('click', suppressNextClick, true);
		}
	};
}
