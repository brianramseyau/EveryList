import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

const { Capacitor } = await import('@capacitor/core');
const { desktopInfo, isDesktop, isRemoteClient } = await import('./desktop');

function fakeBridge(): Window['everylistDesktop'] {
	return { version: '1.2.3', platform: 'darwin', checkForUpdate: vi.fn() };
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
});
