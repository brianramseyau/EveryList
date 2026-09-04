import { apiDelete, apiGet, apiPost } from '$lib/api/client';

const SUBSCRIPTION_ID_KEY = 'everylist:push-subscription-id';

function hasStorage(): boolean {
	return typeof window !== 'undefined';
}

function storedSubscriptionId(): number | null {
	if (!hasStorage()) return null;
	const raw = window.localStorage.getItem(SUBSCRIPTION_ID_KEY);
	return raw ? Number(raw) : null;
}

function setStoredSubscriptionId(id: number | null): void {
	if (!hasStorage()) return;
	if (id === null) window.localStorage.removeItem(SUBSCRIPTION_ID_KEY);
	else window.localStorage.setItem(SUBSCRIPTION_ID_KEY, String(id));
}

/** Web Push (browser tab/PWA) support — separate from `LocalNotifications`'
 * native/Electron support checks elsewhere. */
export function isPushSupported(): boolean {
	return (
		typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
	);
}

/** True once this device holds a subscription id from a prior successful
 * `requestPermissionAndSubscribe()` call — the Settings toggle's initial
 * state. Doesn't re-verify against the browser's actual `PushSubscription`;
 * a mismatch (e.g. the user cleared site data) surfaces the next time a
 * push fails to reach this device, same as any other push subscription. */
export function isSubscribed(): boolean {
	return storedSubscriptionId() !== null;
}

/** Converts the server's URL-safe base64 VAPID public key into the raw
 * bytes `pushManager.subscribe()`'s `applicationServerKey` expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(normalized);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

/**
 * Requests Notification permission, subscribes this browser to Web Push
 * using the server's VAPID public key, and registers the subscription
 * server-side. Returns false (no-op) if permission is denied or push isn't
 * supported — never throws for that, only for an actual network failure.
 */
export async function requestPermissionAndSubscribe(): Promise<boolean> {
	if (!isPushSupported()) return false;

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') return false;

	const { publicKey } = await apiGet<{ publicKey: string }>('/api/v1/push/public-key');
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(publicKey)
	});

	const json = subscription.toJSON();
	const { id } = await apiPost<{ id: number }>('/api/v1/push/subscriptions', {
		endpoint: json.endpoint,
		p256dh: json.keys?.p256dh,
		auth: json.keys?.auth
	});

	setStoredSubscriptionId(id);
	return true;
}

/** Unsubscribes this device both server-side and from the browser's own
 * push manager. Safe to call even if never subscribed. */
export async function unsubscribe(): Promise<void> {
	const id = storedSubscriptionId();
	if (id !== null) {
		await apiDelete(`/api/v1/push/subscriptions/${id}`).catch(() => {
			// Already gone server-side (e.g. expired and pruned) — still clear
			// local state below.
		});
	}
	setStoredSubscriptionId(null);

	if (!isPushSupported()) return;
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	await subscription?.unsubscribe();
}

/** Test-only: drops localStorage state between specs. */
export function resetPushForTesting(): void {
	setStoredSubscriptionId(null);
}
