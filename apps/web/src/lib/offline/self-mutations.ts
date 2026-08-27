const WINDOW_MS = 10_000;
const recent = new Map<string, number>();

function key(entityType: string, entityId: number): string {
	return `${entityType}:${entityId}`;
}

/** Records that this client just mutated an entity, so the realtime broadcast
 * of our own edit — which arrives after the flush clears the row's `_dirty`
 * flag — doesn't trigger a redundant reload of the list (see PLAN_14_PHASE_SYNC_STATUS_OBSERVABILITY.md's
 * silent auto-refresh). */
export function markSelfMutation(entityType: string, entityId: number): void {
	recent.set(key(entityType, entityId), Date.now());
}

/** True (and consumes the mark) if the client mutated this entity within the
 * suppression window. */
export function isSelfMutation(entityType: string, entityId: number): boolean {
	const k = key(entityType, entityId);
	const at = recent.get(k);
	if (at === undefined) return false;
	recent.delete(k);
	if (Date.now() - at > WINDOW_MS) return false;
	return true;
}

/** Test-only: resets the module-level state between specs. */
export function resetSelfMutationsForTesting(): void {
	recent.clear();
}
