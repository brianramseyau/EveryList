import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

const { Capacitor } = await import('@capacitor/core');
const { desktopInfo, isDesktop, isRemoteClient, isStandalone } = await import('./desktop');

function fakeBridge(mode: 'remote' | 'standalone' | null = 'remote'): Window['everylistDesktop'] {
	return {
		version: '1.2.3',
		platform: 'darwin',
		mode,
		checkForUpdate: vi.fn(),
		setBackgroundRun: vi.fn(),
		enableStandalone: vi.fn(),
		recordRemoteMode: vi.fn(),
		consumeStandaloneToken: vi.fn()
	};
}

// Runs in the "client" (real Chromium) project, so `window` is genuine — see desktop.spec.ts
// for the SSR/no-window guard.
describe('desktop platform detection (browser)', () => {
	afterEach(() => {
		delete window.everylistDesktop;
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
	});

	it('isDesktop is false when the preload bridge was never exposed', () => {
		expect(isDesktop()).toBe(false);
	});

	it('isDesktop is true once the bridge is present', () => {
		window.everylistDesktop = fakeBridge();
		expect(isDesktop()).toBe(true);
	});

	it('desktopInfo reflects the bridge contents', () => {
		window.everylistDesktop = fakeBridge();
		expect(desktopInfo()).toEqual({ version: '1.2.3', platform: 'darwin' });
	});

	it('desktopInfo is null without the bridge', () => {
		expect(desktopInfo()).toBeNull();
	});

	it('isRemoteClient is true when the desktop bridge is present', () => {
		window.everylistDesktop = fakeBridge();
		expect(isRemoteClient()).toBe(true);
	});

	it('isRemoteClient is true when Capacitor reports a native platform', () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		expect(isRemoteClient()).toBe(true);
	});

	it('isRemoteClient is false when neither is true', () => {
		expect(isRemoteClient()).toBe(false);
	});

	it('isStandalone is false without the bridge', () => {
		expect(isStandalone()).toBe(false);
	});

	it('isStandalone is false in remote (thin-client) mode', () => {
		window.everylistDesktop = fakeBridge('remote');
		expect(isStandalone()).toBe(false);
	});

	it('isStandalone is true once the bridge reports standalone mode', () => {
		window.everylistDesktop = fakeBridge('standalone');
		expect(isStandalone()).toBe(true);
	});

	it('isRemoteClient is false for a standalone desktop build (same-origin, like Docker/PWA)', () => {
		window.everylistDesktop = fakeBridge('standalone');
		expect(isRemoteClient()).toBe(false);
	});
});
