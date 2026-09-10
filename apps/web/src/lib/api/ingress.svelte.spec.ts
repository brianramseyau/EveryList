import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ingressBase,
	isIngress,
	registerIngressShadowServiceWorker,
	waitForActivation
} from './ingress';

// Runs in the "client" (real Chromium) project so `window` is the genuine
// browser object, not a jsdom-less no-op — see ingress.spec.ts for the
// SSR/no-window guard.
describe('ingress (browser)', () => {
	afterEach(() => {
		delete window.__EVERYLIST_INGRESS_BASE__;
	});

	it('is empty by default — same-origin, like the plain Docker/PWA build', () => {
		expect(ingressBase()).toBe('');
		expect(isIngress()).toBe(false);
	});

	it('reflects the global injected by the API on an Ingress request', () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		expect(ingressBase()).toBe('/api/hassio_ingress/abc123');
		expect(isIngress()).toBe(true);
	});
});

describe('waitForActivation', () => {
	function fakeWorker(initialState: ServiceWorkerState): ServiceWorker {
		const listeners: (() => void)[] = [];
		return {
			state: initialState,
			addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
				listeners.push(listener as () => void);
			},
			removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
				const index = listeners.indexOf(listener as () => void);
				if (index !== -1) listeners.splice(index, 1);
			},
			// Test-only helper, not part of the real ServiceWorker interface.
			fireStateChange(newState: ServiceWorkerState) {
				(this as { state: ServiceWorkerState }).state = newState;
				for (const listener of [...listeners]) listener();
			}
		} as unknown as ServiceWorker & { fireStateChange: (state: ServiceWorkerState) => void };
	}

	it('resolves true immediately when already activated', async () => {
		const worker = fakeWorker('activated');
		await expect(waitForActivation(worker)).resolves.toBe(true);
	});

	it('resolves false immediately when already redundant at call time', async () => {
		const worker = fakeWorker('redundant');
		await expect(waitForActivation(worker)).resolves.toBe(false);
	});

	it('resolves true once a statechange event reports activated', async () => {
		const worker = fakeWorker('installing') as ServiceWorker & {
			fireStateChange: (state: ServiceWorkerState) => void;
		};
		const promise = waitForActivation(worker);

		worker.fireStateChange('installed');
		worker.fireStateChange('activating');
		worker.fireStateChange('activated');

		await expect(promise).resolves.toBe(true);
	});

	it('resolves false if the worker becomes redundant instead of activating (e.g. install failed)', async () => {
		const worker = fakeWorker('installing') as ServiceWorker & {
			fireStateChange: (state: ServiceWorkerState) => void;
		};
		const promise = waitForActivation(worker);

		worker.fireStateChange('installed');
		worker.fireStateChange('redundant');

		await expect(promise).resolves.toBe(false);
	});
});

describe('registerIngressShadowServiceWorker', () => {
	const RELOAD_ONCE_KEY = 'everylist:haIngressShadowSwReloaded';

	afterEach(() => {
		delete window.__EVERYLIST_INGRESS_BASE__;
		window.sessionStorage.removeItem(RELOAD_ONCE_KEY);
		Reflect.deleteProperty(window.navigator, 'serviceWorker');
		vi.restoreAllMocks();
	});

	function stubServiceWorkerContainer(registration: {
		installing?: unknown;
		waiting?: unknown;
		active?: unknown;
	}) {
		const register = vi.fn().mockResolvedValue(registration);
		Object.defineProperty(window.navigator, 'serviceWorker', {
			value: { register },
			configurable: true
		});
		return register;
	}

	it('does nothing when not running under Ingress', async () => {
		const register = stubServiceWorkerContainer({});
		await registerIngressShadowServiceWorker();
		expect(register).not.toHaveBeenCalled();
	});

	it('registers at the ingress path scope and reloads once this session', async () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		const register = stubServiceWorkerContainer({ active: { state: 'activated' } });
		const reload = vi.fn();

		await registerIngressShadowServiceWorker(reload);

		expect(register).toHaveBeenCalledWith('/api/hassio_ingress/abc123/_ha-ingress-shadow-sw.js', {
			scope: '/api/hassio_ingress/abc123/'
		});
		expect(window.sessionStorage.getItem(RELOAD_ONCE_KEY)).toBe('1');
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload a second time in the same session', async () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		window.sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
		stubServiceWorkerContainer({ active: { state: 'activated' } });
		const reload = vi.fn();

		await registerIngressShadowServiceWorker(reload);

		expect(reload).not.toHaveBeenCalled();
	});

	it('reloads even when the registration exposes no installing/waiting/active worker to wait on', async () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		stubServiceWorkerContainer({});
		const reload = vi.fn();

		await registerIngressShadowServiceWorker(reload);

		expect(reload).toHaveBeenCalledTimes(1);
	});

	it('does not reload if the worker never activates (install failed)', async () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		stubServiceWorkerContainer({ active: { state: 'redundant' } });
		const reload = vi.fn();

		await registerIngressShadowServiceWorker(reload);

		expect(reload).not.toHaveBeenCalled();
		expect(window.sessionStorage.getItem(RELOAD_ONCE_KEY)).toBeNull();
	});

	it('is a no-op (no throw) if registration itself fails', async () => {
		window.__EVERYLIST_INGRESS_BASE__ = '/api/hassio_ingress/abc123';
		const register = vi.fn().mockRejectedValue(new Error('registration failed'));
		Object.defineProperty(window.navigator, 'serviceWorker', {
			value: { register },
			configurable: true
		});
		const reload = vi.fn();

		await expect(registerIngressShadowServiceWorker(reload)).resolves.toBeUndefined();
		expect(reload).not.toHaveBeenCalled();
	});
});
