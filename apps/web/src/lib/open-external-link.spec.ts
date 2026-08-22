import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn() } }));

const { Capacitor } = await import('@capacitor/core');
const { Browser } = await import('@capacitor/browser');
const { openExternalLink } = await import('./open-external-link');

function makeClickEvent(): MouseEvent {
	return { preventDefault: vi.fn() } as unknown as MouseEvent;
}

describe('openExternalLink', () => {
	it('lets the browser/PWA handle the link itself on non-native platforms', () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
		const event = makeClickEvent();

		openExternalLink('https://example.com', event);

		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(Browser.open).not.toHaveBeenCalled();
	});

	it('opens the system browser via Capacitor on native platforms, suppressing the default navigation', () => {
		vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
		const event = makeClickEvent();

		openExternalLink('https://example.com', event);

		expect(event.preventDefault).toHaveBeenCalled();
		expect(Browser.open).toHaveBeenCalledWith({ url: 'https://example.com' });
	});
});
