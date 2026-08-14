import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	hasDeferredInstallPrompt,
	initInstallPrompt,
	isIOSSafari,
	isStandalone,
	onInstallAvailabilityChange,
	promptInstall,
	resetInstallPromptForTesting,
	type BeforeInstallPromptEvent
} from './install-prompt';

function stubUserAgent(ua: string) {
	Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function makeBeforeInstallPromptEvent(): BeforeInstallPromptEvent {
	const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
	event.prompt = vi.fn().mockResolvedValue(undefined);
	event.userChoice = Promise.resolve({ outcome: 'accepted' });
	return event;
}

afterEach(() => {
	resetInstallPromptForTesting();
	onInstallAvailabilityChange(null);
	vi.restoreAllMocks();
	Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true });
});

describe('initInstallPrompt', () => {
	it('captures beforeinstallprompt, preventing the default mini-infobar', () => {
		initInstallPrompt();
		const event = makeBeforeInstallPromptEvent();
		const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

		window.dispatchEvent(event);

		expect(preventDefaultSpy).toHaveBeenCalled();
		expect(hasDeferredInstallPrompt()).toBe(true);
	});

	it('notifies the availability listener when a prompt is captured', () => {
		const listener = vi.fn();
		onInstallAvailabilityChange(listener);
		initInstallPrompt();

		window.dispatchEvent(makeBeforeInstallPromptEvent());

		expect(listener).toHaveBeenCalledWith(true);
	});

	it('clears the captured prompt and notifies on appinstalled', () => {
		const listener = vi.fn();
		initInstallPrompt();
		window.dispatchEvent(makeBeforeInstallPromptEvent());
		onInstallAvailabilityChange(listener);

		window.dispatchEvent(new Event('appinstalled'));

		expect(hasDeferredInstallPrompt()).toBe(false);
		expect(listener).toHaveBeenCalledWith(false);
	});
});

describe('promptInstall', () => {
	it('replays the captured prompt and clears it afterward', async () => {
		initInstallPrompt();
		const event = makeBeforeInstallPromptEvent();
		window.dispatchEvent(event);

		await promptInstall();

		expect(event.prompt).toHaveBeenCalled();
		expect(hasDeferredInstallPrompt()).toBe(false);
	});

	it('is a no-op when no prompt was ever captured', async () => {
		await expect(promptInstall()).resolves.toBeUndefined();
	});
});

describe('isStandalone', () => {
	it('is true when the display-mode media query matches', () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
		expect(isStandalone()).toBe(true);
	});

	it('is true via the iOS-specific navigator.standalone flag', () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
		Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
		expect(isStandalone()).toBe(true);
	});

	it('is false in a regular browser tab', () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
		expect(isStandalone()).toBe(false);
	});
});

describe('isIOSSafari', () => {
	it('is true for Mobile Safari on iOS', () => {
		stubUserAgent(
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
		);
		expect(isIOSSafari()).toBe(true);
	});

	it('is false for Chrome on iOS despite the Safari-flavored UA string', () => {
		stubUserAgent(
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/119.0 Mobile/15E148 Safari/604.1'
		);
		expect(isIOSSafari()).toBe(false);
	});

	it('is false on a non-iOS UA', () => {
		stubUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/119.0 Safari/537.36');
		expect(isIOSSafari()).toBe(false);
	});
});
