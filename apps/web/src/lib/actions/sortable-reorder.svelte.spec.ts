import Sortable from 'sortablejs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sortableReorder } from './sortable-reorder';

function makeRow(id: number): HTMLLIElement {
	const li = document.createElement('li');
	li.dataset.itemId = String(id);
	li.textContent = `Row ${id}`;
	li.style.display = 'block';
	li.style.height = '40px';
	return li;
}

function makeList(containerId: string | null): HTMLUListElement {
	const ul = document.createElement('ul');
	if (containerId !== null) ul.dataset.containerId = containerId;
	document.body.append(ul);
	return ul;
}

// SortableJS's fallback drag (forceFallback: true) tracks position off real
// mouse events on the document, not the row itself — mirrors what a real
// press-and-drag gesture dispatches.
function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

// Yields to two real paint frames before an optional timer wait — a fixed
// setTimeout alone isn't a reliable proxy for "the browser has processed the
// event and updated internal state", especially under CI's slower/throttled
// headless Chromium, since SortableJS's own move/animation handling is
// itself paced by requestAnimationFrame.
async function settle(ms = 0) {
	await nextFrame();
	await nextFrame();
	if (ms > 0) await wait(ms);
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000) {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) return;
		await settle(20);
	}
}

function hasFallbackGhost() {
	return document.querySelector('.sortable-fallback') !== null;
}

// Reads the fallback ghost's inline transform translation (matrix a,b,c,d,e,f
// → { x: e, y: f }). Returns null while the ghost is absent or unpositioned.
function ghostTranslation(): { x: number; y: number } | null {
	const ghost = document.querySelector('.sortable-fallback') as HTMLElement | null;
	if (!ghost) return null;
	const match = /^matrix\(([^)]+)\)$/.exec(ghost.style.transform);
	if (!match) return null;
	const values = match[1].split(',').map(Number);
	return { x: values[4], y: values[5] };
}

// `toYFraction` positions the drop within the target row (0 = top edge, 1 =
// bottom edge). SortableJS's fallback swap decision is threshold-based
// (swapThreshold: 0.65) — landing near the row's exact center is a genuine
// toss-up between "before" and "after" and was observed to flip between
// local runs and CI, so tests needing a specific side pick a point well past
// the threshold in that direction rather than the row's midpoint.
async function drag(from: HTMLElement, to: HTMLElement, toYFraction = 0.5) {
	const fromRect = from.getBoundingClientRect();
	const toRect = to.getBoundingClientRect();
	const startX = fromRect.x + fromRect.width / 2;
	const startY = fromRect.y + fromRect.height / 2;
	const endX = toRect.x + toRect.width / 2;
	const endY = toRect.y + toRect.height * toYFraction;

	// SortableJS listens for PointerEvent, not MouseEvent, whenever the
	// browser supports it (true in headless Chromium) — see supportPointer in
	// sortablejs/modular/sortable.esm.js.
	from.dispatchEvent(
		new PointerEvent('pointerdown', {
			bubbles: true,
			cancelable: true,
			pointerId: 1,
			pointerType: 'mouse',
			button: 0,
			clientX: startX,
			clientY: startY
		})
	);
	// A tiny first move is what actually starts the drag (SortableJS creates
	// its fallback ghost element on the first qualifying pointermove, not on
	// pointerdown). The move is well under touchStartThreshold, so it never
	// cancels the press-and-hold delay — but the delay itself must elapse
	// before the drag arms (the choose event adds sortable-chosen), and only
	// then does the next pointermove spawn the ghost. Wait for that arm
	// rather than guessing a fixed delay, so this doesn't race a slower
	// browser.
	document.dispatchEvent(
		new PointerEvent('pointermove', {
			bubbles: true,
			cancelable: true,
			pointerId: 1,
			pointerType: 'mouse',
			button: 0,
			clientX: startX + 1,
			clientY: startY + 1
		})
	);
	await waitUntil(() => from.classList.contains('sortable-chosen'));

	// Fine-grained, multi-step moves — SortableJS's fallback drag tracks
	// position via pointermove, and needs enough steps (each settled to a
	// real paint frame) to register the hover-over-target swap/
	// container-crossing logic; a single big jump doesn't give it a chance.
	const steps = 12;
	for (let i = 1; i <= steps; i++) {
		document.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: startX + ((endX - startX) * i) / steps,
				clientY: startY + ((endY - startY) * i) / steps
			})
		);
		await settle(20);
	}

	document.dispatchEvent(
		new PointerEvent('pointerup', {
			bubbles: true,
			cancelable: true,
			pointerId: 1,
			pointerType: 'mouse',
			button: 0,
			clientX: endX,
			clientY: endY
		})
	);
	// The fallback ghost is removed synchronously in onEnd's handling, so
	// waiting for it to disappear confirms the drop itself has been fully
	// processed (onDrop already called, if it was going to be).
	await waitUntil(() => !hasFallbackGhost());
	// `animation: 150` means SortableJS's own cleanup (clearing its internal
	// dragEl, which _onTapStart checks and silently no-ops on if still set)
	// finishes asynchronously after that — outlasting a short wait here would
	// cause the next drag in the same test to silently do nothing.
	await settle(250);
}

describe('sortableReorder', () => {
	const lists: HTMLUListElement[] = [];

	afterEach(() => {
		for (const list of lists.splice(0)) list.remove();
	});

	it('reports the dragged item and its real new neighbors on drop', async () => {
		const ul = makeList('7');
		lists.push(ul);
		const a = makeRow(1);
		const b = makeRow(2);
		const c = makeRow(3);
		ul.append(a, b, c);

		const onDrop = vi.fn();
		sortableReorder(ul, { group: 'test-same-container', onDrop });

		await drag(a, c, 0.9);

		// Dropping near the bottom of C's row (moving downward) lands A after
		// C, at the end.
		expect(onDrop).toHaveBeenCalledTimes(1);
		expect(onDrop).toHaveBeenCalledWith({
			itemId: 1,
			toContainerId: 7,
			beforeItemId: 3,
			afterItemId: null
		});
		// The library's own DOM move is reverted before onDrop fires — Svelte's
		// state update (driven by onDrop) is the only thing that should ever
		// move these nodes.
		expect([...ul.children]).toEqual([a, b, c]);
	});

	it('reports a null toContainerId for a container with no data-container-id', async () => {
		const ul = makeList(null);
		lists.push(ul);
		const a = makeRow(1);
		const b = makeRow(2);
		ul.append(a, b);

		const onDrop = vi.fn();
		sortableReorder(ul, { group: 'test-null-container', onDrop });

		await drag(a, b, 0.9);

		expect(onDrop).toHaveBeenCalledWith({
			itemId: 1,
			toContainerId: null,
			beforeItemId: 2,
			afterItemId: null
		});
	});

	it('does not call onDrop when a drop leaves the item in its original slot', async () => {
		const ul = makeList('7');
		lists.push(ul);
		const a = makeRow(1);
		const b = makeRow(2);
		ul.append(a, b);

		const onDrop = vi.fn();
		sortableReorder(ul, { group: 'test-noop', onDrop });

		const rect = a.getBoundingClientRect();
		const x = rect.x + rect.width / 2;
		const y = rect.y + rect.height / 2;
		a.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x,
				clientY: y
			})
		);
		// A tiny move at the same slot is under touchStartThreshold, so it
		// doesn't cancel the press-and-hold delay; once the delay elapses the
		// drag is armed (chosenClass added), but the fallback ghost still
		// only appears on the next qualifying pointermove.
		document.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x + 1,
				clientY: y + 1
			})
		);
		await waitUntil(() => a.classList.contains('sortable-chosen'));
		// A second tiny move at the same slot starts the drag (and still
		// exercises onEnd), but never crosses into a new index.
		document.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x + 1,
				clientY: y + 1
			})
		);
		await waitUntil(hasFallbackGhost);
		document.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x + 1,
				clientY: y + 1
			})
		);
		await waitUntil(() => !hasFallbackGhost());
		await settle(250);

		expect(onDrop).not.toHaveBeenCalled();
	});

	it('moves an item between two containers sharing a group', async () => {
		const ulA = makeList('1');
		const ulB = makeList('2');
		lists.push(ulA, ulB);
		const a = makeRow(1);
		ulA.append(a);
		const b = makeRow(2);
		ulB.append(b);

		const onDrop = vi.fn();
		sortableReorder(ulA, { group: 'test-cross-container', onDrop });
		sortableReorder(ulB, { group: 'test-cross-container', onDrop });

		await drag(a, b, 0.1);

		expect(onDrop).toHaveBeenCalledWith({
			itemId: 1,
			toContainerId: 2,
			beforeItemId: null,
			afterItemId: 2
		});
	});

	it('forwards disabled and group changes on update, and unregisters on destroy', async () => {
		const ul = makeList('7');
		lists.push(ul);
		const a = makeRow(1);
		const b = makeRow(2);
		ul.append(a, b);

		const onDrop = vi.fn();
		const action = sortableReorder(ul, { group: 'test-update', onDrop });

		action.update?.({ group: 'test-update', disabled: true, onDrop });
		await drag(a, b);
		expect(onDrop).not.toHaveBeenCalled();

		action.update?.({ group: 'test-update', disabled: false, onDrop });
		await drag(a, b);
		expect(onDrop).toHaveBeenCalledTimes(1);

		expect(Sortable.get(ul)).not.toBeNull();
		action.destroy?.();
		expect(Sortable.get(ul)).toBeNull();
	});

	it("locks the fallback ghost to the y-axis when fallbackAxis is 'y'", async () => {
		const ul = makeList('7');
		lists.push(ul);
		const a = makeRow(1);
		const b = makeRow(2);
		ul.append(a, b);

		const onDrop = vi.fn();
		sortableReorder(ul, { group: 'test-lock-y', fallbackAxis: 'y', onDrop });

		const rect = a.getBoundingClientRect();
		const x = rect.x + rect.width / 2;
		const y = rect.y + rect.height / 2;
		const move = (clientX: number, clientY: number) =>
			document.dispatchEvent(
				new PointerEvent('pointermove', {
					bubbles: true,
					cancelable: true,
					pointerId: 1,
					pointerType: 'mouse',
					button: 0,
					clientX,
					clientY
				})
			);

		a.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x,
				clientY: y
			})
		);
		move(x + 1, y + 1);
		await waitUntil(() => a.classList.contains('sortable-chosen'));

		// First post-arm move spawns the ghost; the second actually moves it.
		move(x + 80, y + 10);
		await waitUntil(hasFallbackGhost);
		move(x + 80, y + 10);
		await settle(20);

		const translation = ghostTranslation();
		expect(translation).not.toBeNull();
		expect(translation!.x).toBe(0);
		expect(translation!.y).not.toBe(0);

		document.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x + 80,
				clientY: y + 10
			})
		);
		await waitUntil(() => !hasFallbackGhost());
		await settle(250);
	});

	it("locks the fallback ghost to the x-axis when fallbackAxis is 'x'", async () => {
		const ul = makeList('7');
		lists.push(ul);
		const a = makeRow(1);
		const b = makeRow(2);
		ul.append(a, b);

		const onDrop = vi.fn();
		sortableReorder(ul, { group: 'test-lock-x', fallbackAxis: 'x', onDrop });

		const rect = a.getBoundingClientRect();
		const x = rect.x + rect.width / 2;
		const y = rect.y + rect.height / 2;
		const move = (clientX: number, clientY: number) =>
			document.dispatchEvent(
				new PointerEvent('pointermove', {
					bubbles: true,
					cancelable: true,
					pointerId: 1,
					pointerType: 'mouse',
					button: 0,
					clientX,
					clientY
				})
			);

		a.dispatchEvent(
			new PointerEvent('pointerdown', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x,
				clientY: y
			})
		);
		move(x + 1, y + 1);
		await waitUntil(() => a.classList.contains('sortable-chosen'));

		move(x + 80, y + 10);
		await waitUntil(hasFallbackGhost);
		move(x + 80, y + 10);
		await settle(20);

		const translation = ghostTranslation();
		expect(translation).not.toBeNull();
		expect(translation!.x).not.toBe(0);
		expect(translation!.y).toBe(0);

		document.dispatchEvent(
			new PointerEvent('pointerup', {
				bubbles: true,
				cancelable: true,
				pointerId: 1,
				pointerType: 'mouse',
				button: 0,
				clientX: x + 80,
				clientY: y + 10
			})
		);
		await waitUntil(() => !hasFallbackGhost());
		await settle(250);
	});
});
