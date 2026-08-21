import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { Transmit } from '@adonisjs/transmit-client';

const onMessage = vi.fn().mockReturnValue(vi.fn());
const create = vi.fn().mockResolvedValue(undefined);
const del = vi.fn().mockResolvedValue(undefined);
const subscription = vi.fn().mockReturnValue({ onMessage, create, delete: del });
const close = vi.fn();
let capturedOptions:
	| { beforeSubscribe: (request: { headers: { set: (k: string, v: string) => void } }) => void }
	| undefined;

vi.mock('@adonisjs/transmit-client', () => ({
	Transmit: vi.fn().mockImplementation(function (options: typeof capturedOptions) {
		capturedOptions = options;
		return { subscription, close };
	})
}));

vi.mock('./api/token', () => ({ getToken: vi.fn() }));
vi.mock('./api/base-url', () => ({ apiBaseUrl: vi.fn().mockReturnValue('') }));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: vi.fn().mockReturnValue(false) }
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

const { getToken } = await import('./api/token');
const { apiBaseUrl } = await import('./api/base-url');
const { Capacitor } = await import('@capacitor/core');
const { App } = await import('@capacitor/app');
const { subscribeToList, resetRealtimeClientForTesting } = await import('./realtime');

describe('realtime', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetRealtimeClientForTesting();
	});

	afterEach(() => {
		resetRealtimeClientForTesting();
		vi.mocked(apiBaseUrl).mockReturnValue('');
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
	});

	it('subscribes to the given list channel and forwards messages', () => {
		const onEvent = vi.fn();
		subscribeToList(1, onEvent);

		expect(subscription).toHaveBeenCalledWith('list/1');
		expect(onMessage).toHaveBeenCalledWith(onEvent);
		expect(create).toHaveBeenCalled();
	});

	it('attaches the bearer token to the subscribe request when present', () => {
		vi.mocked(getToken).mockReturnValue('secret-token');
		subscribeToList(1, vi.fn());

		const setHeader = vi.fn();
		capturedOptions?.beforeSubscribe({ headers: { set: setHeader } });
		expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer secret-token');
	});

	it('does not set an Authorization header when there is no token', () => {
		vi.mocked(getToken).mockReturnValue(null);
		subscribeToList(1, vi.fn());

		const setHeader = vi.fn();
		capturedOptions?.beforeSubscribe({ headers: { set: setHeader } });
		expect(setHeader).not.toHaveBeenCalled();
	});

	it('connects to same-origin when no absolute base URL is configured', () => {
		subscribeToList(1, vi.fn());
		expect(capturedOptions).toBeDefined();
		expect(vi.mocked(Transmit).mock.calls[0][0]).toMatchObject({
			baseUrl: window.location.origin
		});
	});

	it('connects to the configured absolute base URL for the native build', () => {
		vi.mocked(apiBaseUrl).mockReturnValue('https://api.example.com');
		subscribeToList(1, vi.fn());
		expect(vi.mocked(Transmit).mock.calls[0][0]).toMatchObject({
			baseUrl: 'https://api.example.com'
		});
	});

	it('reuses the same client across multiple subscriptions', () => {
		subscribeToList(1, vi.fn());
		subscribeToList(2, vi.fn());

		expect(subscription).toHaveBeenCalledTimes(2);
	});

	it('unsubscribe stops the message handler and deletes the subscription', () => {
		const unsubscribe = subscribeToList(1, vi.fn());
		unsubscribe();

		expect(del).toHaveBeenCalled();
	});

	it('resetRealtimeClientForTesting closes the client', () => {
		subscribeToList(1, vi.fn());
		resetRealtimeClientForTesting();

		expect(close).toHaveBeenCalled();
	});

	it('swallows a subscribe failure instead of throwing', async () => {
		create.mockRejectedValueOnce(new Error('connection failed'));
		expect(() => subscribeToList(1, vi.fn())).not.toThrow();
		await Promise.resolve();
	});

	it('swallows an unsubscribe failure instead of throwing', async () => {
		del.mockRejectedValueOnce(new Error('connection failed'));
		const unsubscribe = subscribeToList(1, vi.fn());
		expect(() => unsubscribe()).not.toThrow();
		await Promise.resolve();
	});

	it('registers an appStateChange listener on native and recreates the subscription on resume', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		let stateHandler: ((state: { isActive: boolean }) => void) | undefined;
		vi.mocked(App.addListener).mockImplementation((_event, handler) => {
			stateHandler = handler as unknown as (state: { isActive: boolean }) => void;
			return Promise.resolve({ remove: vi.fn() });
		});

		subscribeToList(1, vi.fn());
		expect(subscription).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledTimes(1);

		stateHandler?.({ isActive: true });

		expect(del).toHaveBeenCalledTimes(1);
		expect(subscription).toHaveBeenCalledTimes(2);
		expect(create).toHaveBeenCalledTimes(2);
	});

	it('swallows a delete/create failure during the appStateChange resubscribe', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		let stateHandler: ((state: { isActive: boolean }) => void) | undefined;
		vi.mocked(App.addListener).mockImplementation((_event, handler) => {
			stateHandler = handler as unknown as (state: { isActive: boolean }) => void;
			return Promise.resolve({ remove: vi.fn() });
		});

		subscribeToList(1, vi.fn());
		del.mockRejectedValueOnce(new Error('delete failed'));
		create.mockRejectedValueOnce(new Error('create failed'));

		expect(() => stateHandler?.({ isActive: true })).not.toThrow();
		await Promise.resolve();
		await Promise.resolve();

		expect(subscription).toHaveBeenCalledTimes(2);
	});

	it('does not recreate the subscription when appStateChange fires with isActive false', () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		let stateHandler: ((state: { isActive: boolean }) => void) | undefined;
		vi.mocked(App.addListener).mockImplementation((_event, handler) => {
			stateHandler = handler as unknown as (state: { isActive: boolean }) => void;
			return Promise.resolve({ remove: vi.fn() });
		});

		subscribeToList(1, vi.fn());
		stateHandler?.({ isActive: false });

		expect(subscription).toHaveBeenCalledTimes(1);
	});

	it('removes the appStateChange listener on unsubscribe (native)', async () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		const remove = vi.fn();
		vi.mocked(App.addListener).mockResolvedValue({ remove });

		const unsubscribe = subscribeToList(1, vi.fn());
		unsubscribe();
		await Promise.resolve();
		await Promise.resolve();

		expect(remove).toHaveBeenCalled();
	});

	it('does not register an appStateChange listener on the web build', () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
		subscribeToList(1, vi.fn());

		expect(App.addListener).not.toHaveBeenCalled();
	});
});
