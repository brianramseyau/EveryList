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
			data: { listId: payload.listId, itemId: payload.itemId }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const listId = event.notification.data && event.notification.data.listId;
	const url = listId ? `/lists/${listId}` : '/lists';

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
