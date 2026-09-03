// SortableJS-backed drag-to-reorder action, used across every reorderable
// list in the app (list items, categories, store aisle order, and the lists
// page). Where drags can cross containers (e.g. list items between category
// sections), give every `<ul>` in that drag surface the same `group` — one
// Sortable instance per container, SortableJS's native multi-list support
// handles the rest.

import Sortable from 'sortablejs';
import { SortableAxisLock, type FallbackAxis } from './sortable-axis-lock';

export interface SortableReorderParams {
	/** Shared across every `<ul>` in the same drag surface — required for
	 * cross-container dragging (SortableJS only allows drops between lists
	 * that share a group name). Give every `<ul>` on a page its own unique
	 * group when drags should never cross containers (e.g. one per
	 * independent section) — SortableJS containers only accept drops from
	 * others sharing their exact group name. */
	group: string;
	disabled?: boolean;
	/** Pins the fallback drag ghost to a single axis ('y' keeps it from
	 * drifting horizontally while reordering a vertical list). SortableJS
	 * itself has no such option, so this is applied by the axis-lock plugin. */
	fallbackAxis?: FallbackAxis;
	/** Fired when a press-and-hold drag actually starts (true) and ends
	 * (false). Lets a caller suppress competing gestures on the same rows —
	 * e.g. the item-row swipe-to-delete — for the duration of a drag, so a
	 * horizontal move made after the drag has armed can't reveal or commit
	 * them. */
	onDragStateChange?: (active: boolean) => void;
	/** Fired once on drop, only if the item actually moved (container or
	 * position). Everything is read off `data-item-id` / `data-container-id`
	 * attributes rather than array indices. `beforeItemId`/`afterItemId` are
	 * the dragged item's new immediate siblings *within the destination
	 * list* (null at either end) — enough for the caller to place it
	 * correctly in its own full item list and derive a sortOrder from its
	 * real neighbors, without needing to re-touch the DOM itself. */
	onDrop: (params: {
		itemId: number;
		toContainerId: number | null;
		beforeItemId: number | null;
		afterItemId: number | null;
	}) => void;
}

function parseContainerId(raw: string | undefined): number | null {
	return raw === undefined || raw === 'null' ? null : Number(raw);
}

let axisLockMounted = false;

// SortableJS's `option()` is generic over `keyof Sortable.Options`, which
// predates the non-upstream `fallbackAxis` option applied by the axis-lock
// plugin — extend it so that option name is accepted too.
type AxisLockSortable = Sortable & {
	option(name: 'fallbackAxis', value: FallbackAxis | null): void;
};

export function sortableReorder(node: HTMLElement, params: SortableReorderParams) {
	let current = params;

	// Mount once, on first use — deferred out of module scope so importing
	// this action stays side-effect free (and SSR-safe).
	if (!axisLockMounted) {
		axisLockMounted = true;
		Sortable.mount(SortableAxisLock);
	}

	const options: Sortable.Options & { fallbackAxis?: FallbackAxis | null } = {
		group: current.group,
		disabled: current.disabled,
		fallbackAxis: current.fallbackAxis ?? null,
		animation: 150,
		// Not delayOnTouchOnly: a reorder is a deliberate press-and-hold on
		// every pointer, per the plan's long-press convention. Without the
		// delay, mouse drags start on the first qualifying move, so a stray
		// few px of movement during a click on the lists page hijacks the tap
		// and swallows the navigation.
		delay: 400,
		touchStartThreshold: 10,
		filter: '[data-reorder-ignore]',
		preventOnFilter: false,
		// Skip native HTML5 drag-and-drop entirely (mouse-position-based
		// dragging instead) — native DnD's default ghost image/drop-effect
		// styling is hard to control consistently, and it can't be driven by
		// synthetic mouse events at all (only real OS-level drag), which
		// matters for e2e coverage.
		forceFallback: true,
		fallbackOnBody: true,
		swapThreshold: 0.65,
		ghostClass: 'sortable-ghost',
		chosenClass: 'sortable-chosen',
		dragClass: 'sortable-drag',
		onStart() {
			current.onDragStateChange?.(true);
		},
		onEnd(evt) {
			current.onDragStateChange?.(false);
			const unchanged = evt.to === evt.from && evt.newIndex === evt.oldIndex;
			const itemId = Number(evt.item.dataset.itemId);
			const toContainerId = parseContainerId(evt.to.dataset.containerId);

			// evt.item is still physically inside evt.to at evt.newIndex here (the
			// DOM-revert below hasn't happened yet) — its real siblings at this
			// instant are exactly its new neighbors in the destination list.
			// SortableJS's types mark newIndex optional, but onEnd only fires on
			// an actual drop, where it's always set.
			/* v8 ignore next */
			const newIndex = evt.newIndex ?? 0;
			const beforeEl = evt.to.children[newIndex - 1] as HTMLElement | undefined;
			const afterEl = evt.to.children[newIndex + 1] as HTMLElement | undefined;
			const beforeItemId = beforeEl ? Number(beforeEl.dataset.itemId) : null;
			const afterItemId = afterEl ? Number(afterEl.dataset.itemId) : null;

			// SortableJS moves the real DOM node itself as you drag — Svelte's
			// keyed {#each} has no idea that happened, so its own reconciliation
			// (triggered by the state update below) fights the already-moved
			// node. Put the DOM back exactly where it started and let Svelte's
			// reactive update perform the actual move, the same way every
			// SortableJS+vdom-framework integration guide does it.
			evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex!] ?? null);

			if (unchanged) return;
			current.onDrop({ itemId, toContainerId, beforeItemId, afterItemId });
		}
	};
	const sortable = Sortable.create(node, options) as AxisLockSortable;

	return {
		update(next: SortableReorderParams) {
			current = next;
			sortable.option('disabled', Boolean(next.disabled));
			sortable.option('group', next.group);
			sortable.option('fallbackAxis', next.fallbackAxis ?? null);
		},
		destroy() {
			sortable.destroy();
		}
	};
}
