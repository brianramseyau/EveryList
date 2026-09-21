/* v8 ignore start */ // Imports: other specs' `vi.mock('@capacitor/...')` corrupts their V8
// function attribution once merged into the full suite — the same coverage-collection
// artifact documented on `lib/api/items.ts`; widget.spec.ts alone reports these covered.
import { Capacitor } from '@capacitor/core';
import { createToken, fetchTokens, revokeToken, updateToken } from './api/tokens';
import { widgetTokenName } from './widget-token';
import type { EveryListWidgetNative } from './widget-refresh';
import { getServerUrl } from './api/server-url';
/* v8 ignore stop */

function nativeWidgetClient(): EveryListWidgetNative | null {
	if (!Capacitor.isNativePlatform()) return null;
	return Capacitor.registerPlugin<EveryListWidgetNative>('EveryListWidget');
}

/** The list ids this device's widget token already grants, so the settings screen can pre-tick
 *  them — saving replaces the grant set, so starting blank would silently drop lists. Empty when
 *  the widget isn't set up yet (or outside the native build). */
export async function currentWidgetListIds(): Promise<number[]> {
	const client = nativeWidgetClient();
	if (!client) return [];
	const { deviceId, hasToken } = await client.status();
	if (!hasToken) return [];
	const name = widgetTokenName(deviceId);
	const existing = (await fetchTokens()).find((token) => token.name === name);
	return existing?.grants.map((grant) => grant.listId) ?? [];
}

/**
 * Provisions the home-screen widget's list-scoped PAT — exactly one per device, found by its
 * `Home-screen widget (<deviceId>)` name. The first call mints it; every later call updates that
 * token's list grants in place (so the widget can gain access to new lists) instead of minting
 * another. It then hands it to the native shell via the
 * in-app Capacitor plugin (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md), which stores it in private app storage and opens the
 * widget's list-picker. A native widget can't read the WebView's IndexedDB offline cache, so it
 * authenticates to the API directly with this token.
 *
 * Only meaningful inside the Capacitor native build — on the web/PWA/Docker build this is a no-op
 * (returns `false`), so the Settings entry can still render everywhere and simply explain the
 * widget requires the native app.
 */
export async function configureWidget(listIds: number[]): Promise<boolean> {
	const client = nativeWidgetClient();
	if (!client) return false;

	// Provably covered in isolation (run widget.spec.ts alone and this file reports
	// 100%) — other spec files' `vi.mock('$lib/api/server-url', …)` corrupts this
	// statement's V8 attribution once merged into the full suite, the same
	// coverage-collection artifact documented on `$lib/api/selected-store.ts` and
	// `$lib/api/token.ts`.
	/* v8 ignore next */
	const serverUrl = getServerUrl();
	if (!serverUrl) return false;

	const { deviceId, hasToken } = await client.status();
	const name = widgetTokenName(deviceId);
	const existing = (await fetchTokens()).find((token) => token.name === name);

	if (existing && hasToken) {
		await updateToken(existing.id, listIds, 'editor', name);
		await client.configure({ listIds, serverUrl });
		return true;
	}

	// The server has a token this device no longer holds the plaintext for (app data cleared) —
	// its value can't be recovered, so replace it rather than leave an orphan behind.
	if (existing) await revokeToken(existing.id);
	const created = await createToken(name, listIds, 'editor');
	await client.configure({ token: created.token, listIds, serverUrl });
	return true;
}
