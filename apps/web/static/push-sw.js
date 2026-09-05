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
				{ action: 'snooze', title: 'Snooze 1 hr' }
			]
		})
	);
});

// Auth for the "Complete"/"Snooze" actions below — a service worker can't reach localStorage
// (where apps/web/src/lib/api/token.ts normally keeps the bearer token), so token.ts also mirrors
// it into this IndexedDB store on every login/logout. Database/store/key names here must match
// token.ts's mirrorTokenToServiceWorker exactly.
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

async function patchItem(listId, itemId, body) {
	const token = await getAuthToken();
	if (!token) return;
	// Same-origin relative path: the web/PWA build (the only build that registers this service
	// worker — see +layout.svelte) always talks to its own origin, unlike the native/Electron
	// builds' configurable remote server.
	await fetch(`/api/v1/lists/${listId}/items/${itemId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify(body)
	});
}

// Mirrors apps/web/src/lib/deadline.ts's addHoursToDeadline — duplicated here in plain JS since
// this file is copied verbatim, never bundled, so it can't import that module.
function addHoursToDeadline(deadline, hours) {
	const hasTime = deadline.length > 10;
	const date = deadline.slice(0, 10);
	const time = deadline.slice(11);
	const [year, month, day] = date.split('-').map(Number);
	const [hour, minute] = hasTime ? time.split(':').map(Number) : [9, 0];
	const at = new Date(year, month - 1, day, hour, minute);
	at.setHours(at.getHours() + hours);
	const pad = (value) => (value < 10 ? `0${value}` : String(value));
	return (
		`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
		`T${pad(at.getHours())}:${pad(at.getMinutes())}`
	);
}

self.addEventListener('notificationclick', (event) => {
	const data = event.notification.data || {};
	event.notification.close();

	if (event.action === 'complete') {
		event.waitUntil(patchItem(data.listId, data.itemId, { checked: true }));
		return;
	}
	if (event.action === 'snooze') {
		if (!data.deadline) return;
		event.waitUntil(patchItem(data.listId, data.itemId, { deadline: addHoursToDeadline(data.deadline, 1) }));
		return;
	}

	const url = data.listId ? `/lists/${data.listId}` : '/lists';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if ('focus' in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			if (self.clients.openWindow) return self.clients.openWindow(url);
		})
	);
});
