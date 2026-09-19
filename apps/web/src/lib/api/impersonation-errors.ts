/** Starting an impersonation wipes the local offline cache, which also holds the admin's own
 * unsynced changes — so it's refused until those have synced (or been dealt with). */
export class PendingChangesError extends Error {
	constructor() {
		super(
			'You have unsynced changes. Let them sync (or resolve them in Settings → Sync status) before impersonating.'
		);
		this.name = 'PendingChangesError';
	}
}
