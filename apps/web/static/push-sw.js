// Deadline notifications' push handling — imported into the Workbox-generated
// sw.js via `importScripts` (see pwa.config.mjs's `workboxOptions.importScripts`
// and PLAN_26_PHASE_DEADLINE_NOTIFICATIONS.md for why this lives in its own
// unbundled file instead of switching the whole PWA build to injectManifest).
// Plain, unbundled JS — this file is copied verbatim from apps/web/static/,
// never passed through Vite/TypeScript.

self.addEventListener('push', (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		return;
	}

	event.waitUntil(
		self.registration.showNotification(payload.title || 'EveryList', {
			body: payload.body || '',
			icon: '/icon-192.png',
			badge: '/icon-192.png',
			data: { listId: payload.listId, itemId: payload.itemId, deadline: payload.deadline },
			actions: [
				{ action: 'complete', title: 'Complete' },
				{ action: 'snooze', title: 'Reschedule' }
			]
		})
	);
});

// Auth for the "Complete" action below — a service worker can't reach localStorage (where
// apps/web/src/lib/api/token.ts normally keeps the bearer token), so token.ts also mirrors it into
// this IndexedDB store on every login/logout. Database/store/key names here must match token.ts's
// mirrorTokenToServiceWorker exactly.
function getAuthToken() {
	return new Promise((resolve) => {
		const request = indexedDB.open('everylist-sw-auth', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('kv');
		request.onsuccess = () => {
			const db = request.result;
			const tx = db.transaction('kv', 'readonly');
			const getRequest = tx.objectStore('kv').get('token');
			getRequest.onsuccess = () => resolve(getRequest.result || null);
			getRequest.onerror = () => resolve(null);
		};
		request.onerror = () => resolve(null);
	});
}

// On any failure — no token (mirror never populated / stale), offline, the item having been
// deleted, an expired session, a server error — falls back to a plain notification telling the
// user to retry from the app, rather than failing silently: the triggering notification is
// already closed (see notificationclick below) by the time this runs, so without this the user
// would have no sign "Complete" didn't actually happen.
async function patchItem(listId, itemId, body) {
	try {
		const token = await getAuthToken();
		if (!token) throw new Error('no auth token available');

		// Same-origin relative path: the web/PWA build (the only build that registers this
		// service worker — see +layout.svelte) always talks to its own origin, unlike the
		// native/Electron builds' configurable remote server.
		const response = await fetch(`/api/v1/lists/${listId}/items/${itemId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(`PATCH failed with status ${response.status}`);
	} catch (error) {
		// Logged (matching native.ts's equivalent handlers) so a "Complete didn't work" report has
		// more to go on than just the generic fallback notification below.
		console.error('Failed to update item from notification action', error);
		await self.registration.showNotification('EveryList', {
			body: "Couldn't update the item — open the app and try again.",
			icon: '/icon-192.png',
			badge: '/icon-192.png'
		});
	}
}

// Focuses an existing client window navigated to `url`, or opens a new one — shared by a plain
// notification-body tap and the "Reschedule" action below, which both just need to land the user
// on a specific in-app route rather than acting in the background.
function openUrl(url) {
	return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
		for (const client of clientList) {
			if ('focus' in client) {
				client.navigate(url);
				return client.focus();
			}
		}
		if (self.clients.openWindow) return self.clients.openWindow(url);
	});
}

self.addEventListener('notificationclick', (event) => {
	const data = event.notification.data || {};
	event.notification.close();

	if (event.action === 'complete') {
		event.waitUntil(patchItem(data.listId, data.itemId, { checked: true }));
		return;
	}

	const url = data.listId
		? data.itemId
			? `/lists/${data.listId}/items/${data.itemId}`
			: `/lists/${data.listId}`
		: '/lists';

	// "Reschedule" (formerly an instant +1hr snooze) has no UI of its own to offer from a service
	// worker, so it just opens the item with `?reschedule=1` — the item page picks that up and
	// shows the shortcut-picker overlay (RescheduleOverlay.svelte) instead.
	if (event.action === 'snooze') {
		if (!data.listId || !data.itemId) return;
		event.waitUntil(openUrl(`${url}?reschedule=1`));
		return;
	}

	event.waitUntil(openUrl(url));
});
