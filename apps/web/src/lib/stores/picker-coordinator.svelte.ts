/**
 * IconPicker and ColorPicker each manage their own open/closed state, but a
 * page can render several of them side by side (e.g. the new-list row) or
 * nested inside another popover (ListMenu). Without a shared notion of
 * "which one is open", two could be expanded at once, which is confusing
 * next to each other and can overlap. This module is the single source of
 * truth for that: whichever picker last opened becomes `activeId`, which
 * implicitly closes any other picker still reading it.
 */
let activeId = $state<symbol | null>(null);

export const pickerCoordinator = {
	get activeId() {
		return activeId;
	},
	open(id: symbol) {
		activeId = id;
	},
	close(id: symbol) {
		if (activeId === id) activeId = null;
	},
	toggle(id: symbol) {
		activeId = activeId === id ? null : id;
	}
};
