import { afterEach, describe, expect, it } from 'vitest';
import { anchorPanel } from './anchor-panel';

function stubRect(el: HTMLElement, rect: Partial<DOMRect>) {
	el.getBoundingClientRect = () =>
		({
			x: 0,
			y: 0,
			width: 0,
			height: 0,
			top: 0,
			right: 0,
			bottom: 0,
			left: 0,
			toJSON() {
				return this;
			},
			...rect
		}) as DOMRect;
}

function stubViewport(width: number, height: number) {
	Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
	Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

describe('anchorPanel', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('opens the panel below the anchor, right-edge aligned, when it already fits', () => {
		stubViewport(1000, 1000);
		const anchor = document.createElement('button');
		const panel = document.createElement('div');
		document.body.append(anchor, panel);
		stubRect(anchor, { top: 100, bottom: 130, left: 200, right: 400 });
		stubRect(panel, { width: 288, height: 200 });

		anchorPanel(panel, anchor);

		expect(panel.style.left).toBe('112px'); // 400 - 288
		expect(panel.style.top).toBe('134px'); // 130 + 4
	});

	it('clamps the left edge so the panel never opens off the left of the screen', () => {
		stubViewport(300, 1000);
		const anchor = document.createElement('button');
		const panel = document.createElement('div');
		document.body.append(anchor, panel);
		// Right-aligning a 288px panel under this anchor would put its left
		// edge at a negative coordinate.
		stubRect(anchor, { top: 100, bottom: 130, left: 0, right: 20 });
		stubRect(panel, { width: 288, height: 200 });

		anchorPanel(panel, anchor);

		expect(panel.style.left).toBe('8px');
	});

	it('clamps the right edge so the panel never opens off the right of the screen', () => {
		stubViewport(500, 1000);
		const anchor = document.createElement('button');
		const panel = document.createElement('div');
		document.body.append(anchor, panel);
		// Right-aligning under this anchor would push the panel's right edge
		// past the 500px-wide viewport.
		stubRect(anchor, { top: 100, bottom: 130, left: 450, right: 498 });
		stubRect(panel, { width: 288, height: 200 });

		anchorPanel(panel, anchor);

		expect(panel.style.left).toBe('204px'); // 500 - 288 - 8
	});

	it('flips the panel above the anchor when there is no room below', () => {
		stubViewport(1000, 400);
		const anchor = document.createElement('button');
		const panel = document.createElement('div');
		document.body.append(anchor, panel);
		stubRect(anchor, { top: 350, bottom: 380, left: 200, right: 240 });
		stubRect(panel, { width: 288, height: 200 });

		anchorPanel(panel, anchor);

		expect(panel.style.top).toBe('146px'); // 350 - 200 - 4
	});

	it('repositions on window resize and stops once destroyed', () => {
		stubViewport(1000, 1000);
		const anchor = document.createElement('button');
		const panel = document.createElement('div');
		document.body.append(anchor, panel);
		stubRect(anchor, { top: 100, bottom: 130, left: 200, right: 400 });
		stubRect(panel, { width: 288, height: 200 });

		const action = anchorPanel(panel, anchor);
		expect(panel.style.top).toBe('134px');

		// Shrinking the viewport should flip the panel above the anchor.
		stubViewport(1000, 250);
		window.dispatchEvent(new Event('resize'));
		expect(panel.style.top).toBe('8px'); // clamped: 100 - 200 - 4 < margin

		action.destroy();
		stubRect(anchor, { top: 500, bottom: 530, left: 200, right: 400 });
		window.dispatchEvent(new Event('resize'));
		// Unchanged — the resize listener was removed by destroy().
		expect(panel.style.top).toBe('8px');
	});
});
