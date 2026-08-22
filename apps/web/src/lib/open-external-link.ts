import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * A note's link should always open outside the app, never navigate the PWA/native WebView itself.
 * `target="_blank"` on the `<a>` already achieves that in a browser tab or an installed standalone
 * PWA — an out-of-scope navigation like an arbitrary pasted URL hands off to the system browser on
 * its own. Capacitor's native WebView has no concept of tabs, though, so `target="_blank"` there
 * just does nothing useful; `@capacitor/browser`'s `Browser.open()` is the one reliable way to
 * escape it and reach the system browser.
 */
export function openExternalLink(url: string, event: MouseEvent): void {
	if (!Capacitor.isNativePlatform()) return;
	event.preventDefault();
	void Browser.open({ url });
}
