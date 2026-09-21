import { Capacitor } from '@capacitor/core';
import type { WidgetConfigDto, WidgetStatusDto } from '@everylist/shared';

/** The native `EveryListWidget` Capacitor plugin's methods — the one definition both this module
 *  and `widget.ts` (the provisioning handoff) type against, so they can't drift apart.
 *  `configure` writes the PAT to the widget's private SharedPreferences rather than carrying it in
 *  a URL (an `everylist://widget-config` query string can surface in `dumpsys`/logcat). */
export interface EveryListWidgetNative {
	status(): Promise<WidgetStatusDto>;
	configure(config: WidgetConfigDto): Promise<void>;
	refresh(): Promise<void>;
}

/** Trailing-edge debounce: checking off several items in a row costs the widget one network
 *  fetch, not one per tap. */
export const WIDGET_REFRESH_DEBOUNCE_MS = 1000;

let timer: ReturnType<typeof setTimeout> | undefined;
let client: EveryListWidgetNative | undefined;
let listening = false;

function flush(): void {
	clearTimeout(timer);
	timer = undefined;
	client ??= Capacitor.registerPlugin<EveryListWidgetNative>('EveryListWidget');
	// Best-effort: a widget that fails to refresh here still has its own refresh button.
	client.refresh().catch(() => {});
}

/** Backgrounding the app (home button, app switch) is the usual next move after checking
 *  something off — send the pending refresh right then rather than risk the WebView being
 *  frozen or killed before the debounce timer fires. */
function onVisibilityChange(): void {
	if (document.visibilityState === 'hidden' && timer !== undefined) flush();
}

/**
 * Asks the native Android widget(s) to re-render from the server, so a change made in the app
 * shows up on the home screen without the user tapping the widget's refresh button. Called from
 * every successful API mutation (`apiFetch`) — which includes the offline queue's flush, so a
 * change only counts once the server actually has it. A no-op outside the Android build (iOS and
 * the PWA have no widget plugin).
 */
export function refreshWidget(): void {
	if (Capacitor.getPlatform() !== 'android') return;
	if (!listening) {
		listening = true;
		document.addEventListener('visibilitychange', onVisibilityChange);
	}
	// A write landing while already hidden (a background sync draining the offline queue) has no
	// later visibility change to flush it, so skip the debounce and send it now.
	if (document.visibilityState === 'hidden') {
		flush();
		return;
	}
	clearTimeout(timer);
	timer = setTimeout(flush, WIDGET_REFRESH_DEBOUNCE_MS);
}

/** Test-only: drops the pending timer, listener and cached plugin handle between specs. */
export function resetWidgetRefreshForTesting(): void {
	clearTimeout(timer);
	timer = undefined;
	client = undefined;
	if (listening) document.removeEventListener('visibilitychange', onVisibilityChange);
	listening = false;
}
