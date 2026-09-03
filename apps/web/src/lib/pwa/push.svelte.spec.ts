import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiGet: vi.fn(),
	apiPost: vi.fn(),
	apiDelete: vi.fn()
}));

const { apiGet, apiPost, apiDelete } = await import('$lib/api/client');
const {
	isPushSupported,
	isSubscribed,
	requestPermissionAndSubscribe,
	unsubscribe,
	resetPushForTesting
} = await import('./push');

function stubPushApi(
	overrides: {
		permission?: NotificationPermission;
		subscribeResult?: unknown;
		existingSubscription?: unknown;
	} = {}
) {
	const permission = overrides.permission ?? 'granted';
	const requestPermission = vi.fn().mockResolvedValue(permission);
	vi.stubGlobal('Notification', { requestPermission });

	const subscribe = vi.fn().mockResolvedValue(
		overrides.subscribeResult ?? {
			toJSON: () => ({
				endpoint: 'https://push.example.com/device',
				keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
			})
		}
	);
	const unsubscribeFn = vi.fn().mockResolvedValue(undefined);
	const existing =
		overrides.existingSubscription === undefined
			? { unsubscribe: unsubscribeFn }
			: overrides.existingSubscription;
	const getSubscription = vi.fn().mockResolvedValue(existing);

	const registration = { pushManager: { subscribe, getSubscription } };
	Object.defineProperty(window.navigator, 'serviceWorker', {
		value: { ready: Promise.resolve(registration) },
		configurable: true
	});
	Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });

	return { requestPermission, subscribe, getSubscription, unsubscribeFn };
}

afterEach(() => {
	resetPushForTesting();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(window.navigator, 'serviceWorker');
	Reflect.deleteProperty(window, 'PushManager');
});

describe('isPushSupported', () => {
	it('is true once serviceWorker/PushManager are stubbed', () => {
		stubPushApi();
		expect(isPushSupported()).toBe(true);
	});

	it('is false when serviceWorker/PushManager are absent', () => {
		expect(isPushSupported()).toBe(false);
	});
});

describe('requestPermissionAndSubscribe', () => {
	it('subscribes and stores the returned id, once permission is granted', async () => {
		stubPushApi();
		vi.mocked(apiGet).mockResolvedValue({ publicKey: 'AAAA' });
		vi.mocked(apiPost).mockResolvedValue({ id: 42 });

		const result = await requestPermissionAndSubscribe();

		expect(result).toBe(true);
		expect(apiPost).toHaveBeenCalledWith('/api/v1/push/subscriptions', {
			endpoint: 'https://push.example.com/device',
			p256dh: 'p256dh-key',
			auth: 'auth-key'
		});
		expect(isSubscribed()).toBe(true);
	});

	it('is a no-op when permission is denied', async () => {
		stubPushApi({ permission: 'denied' });

		const result = await requestPermissionAndSubscribe();

		expect(result).toBe(false);
		expect(apiPost).not.toHaveBeenCalled();
		expect(isSubscribed()).toBe(false);
	});

	it('is a no-op when push is unsupported', async () => {
		const result = await requestPermissionAndSubscribe();
		expect(result).toBe(false);
	});
});

describe('unsubscribe', () => {
	it('deletes the stored subscription server-side and unsubscribes locally', async () => {
		const { unsubscribeFn } = stubPushApi();
		vi.mocked(apiGet).mockResolvedValue({ publicKey: 'AAAA' });
		vi.mocked(apiPost).mockResolvedValue({ id: 7 });
		await requestPermissionAndSubscribe();
		vi.mocked(apiDelete).mockResolvedValue(undefined);

		await unsubscribe();

		expect(apiDelete).toHaveBeenCalledWith('/api/v1/push/subscriptions/7');
		expect(unsubscribeFn).toHaveBeenCalled();
		expect(isSubscribed()).toBe(false);
	});

	it('clears local state even if the server delete fails', async () => {
		stubPushApi();
		vi.mocked(apiGet).mockResolvedValue({ publicKey: 'AAAA' });
		vi.mocked(apiPost).mockResolvedValue({ id: 9 });
		await requestPermissionAndSubscribe();
		vi.mocked(apiDelete).mockRejectedValue(new Error('gone'));

		await unsubscribe();

		expect(isSubscribed()).toBe(false);
	});

	it('does nothing server-side when never subscribed, but still checks the browser', async () => {
		stubPushApi({ existingSubscription: null });

		await unsubscribe();

		expect(apiDelete).not.toHaveBeenCalled();
	});
});
