// Prototype: SortableJS-backed replacement for press-hold-reorder.ts, scoped
// to the list-detail item reorder (the cross-category case that's driven
// three separate touch/scroll bug-fix commits by hand). One Sortable
// instance per category `<ul>`, all sharing `group` so a drag can cross
// between them — SortableJS's native multi-list support replaces the
// flat-index/gap-offset math the hand-rolled version had to derive itself.

import Sortable from 'sortablejs';

export interface SortableReorderParams {
	/** Shared across every `<ul>` in the same drag surface — required for
	 * cross-container dragging (SortableJS only allows drops between lists
	 * that share a group name). Give every `<ul>` on a page its own unique
	 * group when drags should never cross containers (e.g. one per
	 * independent section) — SortableJS containers only accept drops from
	 * others sharing their exact group name. */
	group: string;
	disabled?: boolean;
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

export function sortableReorder(node: HTMLElement, params: SortableReorderParams) {
	let current = params;

	const sortable = Sortable.create(node, {
		group: current.group,
		disabled: current.disabled,
		animation: 150,
		delay: 400,
		delayOnTouchOnly: true,
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
		onEnd(evt) {
			const unchanged = evt.to === evt.from && evt.newIndex === evt.oldIndex;
			const itemId = Number(evt.item.dataset.itemId);
			const toContainerId = parseContainerId(evt.to.dataset.containerId);

			// evt.item is still physically inside evt.to at evt.newIndex here (the
			// DOM-revert below hasn't happened yet) — its real siblings at this
			// instant are exactly its new neighbors in the destination list.
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
	});

	return {
		update(next: SortableReorderParams) {
			current = next;
			sortable.option('disabled', Boolean(next.disabled));
			sortable.option('group', next.group);
		},
		destroy() {
			sortable.destroy();
		}
	};
}
