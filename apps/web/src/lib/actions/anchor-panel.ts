/**
 * Positions a popover `node` (expected to have `class="fixed"`) below its
 * `anchor` element, right-edge aligned, then clamps both axes to the
 * viewport. Popovers such as IconPicker/ColorPicker used to rely on
 * `position: absolute` with no offset, which let a wide panel opened near a
 * screen edge overflow past it — the resulting scrollable area caused the
 * page to jump sideways once the panel's autofocused input scrolled itself
 * into view. Viewport-relative `fixed` coordinates sidestep that: the panel
 * can never extend past `window.inner{Width,Height}`, so there is nothing
 * for the browser to scroll to.
 */
export function anchorPanel(node: HTMLElement, anchor: HTMLElement) {
	const MARGIN = 8;

	function reposition() {
		const anchorRect = anchor.getBoundingClientRect();
		const panelRect = node.getBoundingClientRect();

		let left = anchorRect.right - panelRect.width;
		left = Math.min(left, window.innerWidth - panelRect.width - MARGIN);
		left = Math.max(left, MARGIN);

		let top = anchorRect.bottom + 4;
		if (top + panelRect.height > window.innerHeight - MARGIN) {
			top = anchorRect.top - panelRect.height - 4;
		}
		top = Math.max(top, MARGIN);

		node.style.left = `${left}px`;
		node.style.top = `${top}px`;
	}

	reposition();
	window.addEventListener('resize', reposition);

	return {
		destroy() {
			window.removeEventListener('resize', reposition);
		}
	};
}
