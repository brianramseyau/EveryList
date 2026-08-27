/* v8 ignore start */ // Imports: other specs' `vi.mock('@capacitor/...')` corrupts their V8
// function attribution once merged into the full suite — the same coverage-collection
// artifact documented on `lib/api/items.ts`; widget.spec.ts alone reports these covered.
import type { WidgetConfigDto } from '@everylist/shared';
import { Capacitor } from '@capacitor/core';
import { createToken } from './api/tokens';
import { getServerUrl } from './api/server-url';
/* v8 ignore stop */

/** The PAT name the widget-minting flow uses, so it's recognizable/revocable in
 *  Settings → Access Tokens (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). */
export const WIDGET_TOKEN_NAME = 'Home-screen widget';

/** The native handoff channel (the Capacitor `EveryListWidgetPlugin`). Kept token-free of any URL:
 *  `configure` writes the PAT to the widget's private SharedPreferences and opens the config
 *  screen — the earlier design carried the token in an `everylist://widget-config` deep-link query
 *  string, which Android can surface in `dumpsys`/logcat. */
interface EveryListWidgetNative {
	configure(config: WidgetConfigDto): Promise<void>;
}

function nativeWidgetClient(): EveryListWidgetNative | null {
	if (!Capacitor.isNativePlatform()) return null;
	return Capacitor.registerPlugin<EveryListWidgetNative>('EveryListWidget');
}

/**
 * Mints a list-scoped PAT for the home-screen widget and hands it to the native shell via the
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

	const created = await createToken(WIDGET_TOKEN_NAME, listIds, 'editor');
	await client.configure({ token: created.token, listIds, serverUrl });
	return true;
}
