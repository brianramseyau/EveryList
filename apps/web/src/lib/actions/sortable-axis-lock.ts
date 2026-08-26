// SortableJS's fallback drag (forceFallback: true) moves the floating ghost
// clone by writing the pointer's full dx *and* dy into its transform — see
// the library's `_onTouchMove`, which sets both unconditionally. There is no
// upstream option to lock a single axis (the `fallbackAxis` flag found in
// some forks is not part of this dependency), so this plugin re-zeroes the
// locked axis after each move: the ghost stays pinned to the column while the
// other axis keeps tracking the pointer.
//
// Modeled on the bundled AutoScroll plugin (same pluginEvent hook shape); it
// is mounted lazily by sortable-reorder.ts on first use so importing this
// module has no side effects of its own.
import Sortable from 'sortablejs';

export type FallbackAxis = 'x' | 'y';

export class SortableAxisLock {
	static pluginName = 'axisLock';
	static initializeByDefault = true;

	// Populated by SortableJS's PluginManager before any hook fires.
	sortable!: Sortable;
	options!: Sortable.Options & { fallbackAxis?: FallbackAxis | null };

	defaults = { fallbackAxis: null as FallbackAxis | null };

	// Registered on document in the bubble phase, after SortableJS's own
	// `_onTouchMove` listener (bound earlier in `_triggerDragStart`), so each
	// move is fully applied before the locked axis is reset. The `Global`
	// suffix fires these hooks for any initialized plugin instance — the
	// non-Global events only run when `options[pluginName]` is truthy, and
	// this plugin is gated by `fallbackAxis` instead.
	dragStartedGlobal() {
		if (!this.options.fallbackAxis) return;
		document.addEventListener('pointermove', this.onMove);
	}

	// Fired at the end of every drop/cancel (`_onDrop` always calls
	// `_nulling`), so the listener can't outlive a drag.
	nullingGlobal() {
		document.removeEventListener('pointermove', this.onMove);
	}

	private onMove = () => {
		const ghost = Sortable.ghost;
		/* v8 ignore next -- the ghost is created in _appendGhost before any post-arm move fires */
		if (!ghost) return;
		const transform = ghost.style.transform;
		/* v8 ignore next -- SortableJS always writes a matrix() to the ghost transform */
		if (!transform || !transform.startsWith('matrix(')) return;
		const values = transform.slice(7, -1).split(',').map(Number);
		/* v8 ignore next -- that matrix always has exactly six components */
		if (values.length !== 6) return;
		// matrix(a, b, c, d, e, f): e is x translation, f is y translation.
		values[this.options.fallbackAxis === 'x' ? 5 : 4] = 0;
		const locked = `matrix(${values.join(',')})`;
		ghost.style.transform = locked;
		ghost.style.webkitTransform = locked;
	};
}
