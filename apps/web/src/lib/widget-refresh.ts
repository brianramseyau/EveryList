import { Capacitor } from '@capacitor/core';

/** Trailing-edge debounce: checking off several items in a row costs the widget one network
 *  fetch, not one per tap. */
export const WIDGET_REFRESH_DEBOUNCE_MS = 1000;

interface EveryListWidgetRefresh {
	refresh(): Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let client: EveryListWidgetRefresh | null = null;

/**
 * Asks the native Android widget(s) to re-render from the server, so a change made in the app
 * shows up on the home screen without the user tapping the widget's refresh button. Called from
 * every successful API mutation (`apiFetch`) — which includes the offline queue's flush, so a
 * change only counts once the server actually has it. A no-op outside the Android build (iOS and
 * the PWA have no widget plugin).
 */
export function refreshWidget(): void {
	if (Capacitor.getPlatform() !== 'android') return;
	clearTimeout(timer);
	timer = setTimeout(() => {
		timer = undefined;
		client ??= Capacitor.registerPlugin<EveryListWidgetRefresh>('EveryListWidget');
		// Best-effort: a widget that fails to refresh here still has its own refresh button.
		client.refresh().catch(() => {});
	}, WIDGET_REFRESH_DEBOUNCE_MS);
}

/** Test-only: drops the pending timer and cached plugin handle between specs. */
export function resetWidgetRefreshForTesting(): void {
	clearTimeout(timer);
	timer = undefined;
	client = null;
}
