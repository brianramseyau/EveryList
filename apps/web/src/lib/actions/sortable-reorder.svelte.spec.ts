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

async function drag(from: HTMLElement, to: HTMLElement) {
	const fromRect = from.getBoundingClientRect();
	const toRect = to.getBoundingClientRect();
	const startX = fromRect.x + fromRect.width / 2;
	const startY = fromRect.y + fromRect.height / 2;
	const endX = toRect.x + toRect.width / 2;
	const endY = toRect.y + toRect.height / 2;

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
	await wait(20);

	// Fine-grained, multi-step moves with a real gap between them — SortableJS's
	// fallback drag tracks position via pointermove, and needs both enough
	// steps and enough time between them to register the drag start and the
	// hover-over-target swap/container-crossing logic; steps fired back to
	// back (e.g. every 10ms) land too fast for it to pick up a container
	// crossing.
	const steps = 10;
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
		await wait(20);
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
	// `animation: 150` means SortableJS's own cleanup (clearing its internal
	// dragEl, which _onTapStart checks and silently no-ops on if still set)
	// finishes asynchronously — outlasting a short wait here would cause the
	// next drag in the same test file to silently do nothing.
	await wait(200);
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

		await drag(a, c);

		// Dropping on C's row (moving downward) lands A after C, at the end.
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

		await drag(a, b);

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
		await wait(10);
		// A tiny move at the same slot still starts the drag (and still
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
		await wait(10);
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
		await wait(200);

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

		await drag(a, b);

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
});
