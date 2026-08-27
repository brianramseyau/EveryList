/* v8 ignore start */ // Imports: other specs' `vi.mock('@capacitor/...')` corrupts their V8
// function attribution once merged into the full suite — the same coverage-collection
// artifact documented on `lib/api/items.ts`; widget.spec.ts alone reports these covered.
import type { WidgetConfigDto } from '@everylist/shared';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { createToken } from './api/tokens';
import { getServerUrl } from './api/server-url';
/* v8 ignore stop */

/** The PAT name the widget-minting flow uses, so it's recognizable/revocable in
 *  Settings → Access Tokens (PHASE18_PLAN.md). */
export const WIDGET_TOKEN_NAME = 'Home-screen widget';

/** The custom scheme's authority for the widget-config handoff — must match the
 *  `everylist://widget-config` path filter on the native WidgetConfigActivity. */
const WIDGET_CONFIG_PATH = 'widget-config';

/** Builds the `everylist://widget-config` deep link carrying the app→widget handoff
 *  payload. `encodeURIComponent` on every value so the token (which contains no
 *  scheme-hostile chars but is user-visible) and list ids round-trip safely. */
export function buildWidgetConfigUrl(config: WidgetConfigDto): string {
	const params = new URLSearchParams({
		token: config.token,
		serverUrl: config.serverUrl,
		listIds: config.listIds.join(',')
	});
	return `everylist://${WIDGET_CONFIG_PATH}?${params.toString()}`;
}

/**
 * Mints a list-scoped PAT for the home-screen widget and hands it to the native
 * shell via the `everylist://widget-config` deep link, which Android routes to
 * `WidgetConfigActivity` (PHASE18_PLAN.md). A native widget can't read the WebView's
 * IndexedDB offline cache, so it authenticates to the API directly with this token.
 *
 * Only meaningful inside the Capacitor native build — on the web/PWA/Docker build this
 * is a no-op (returns `false`), so the Settings entry can still render everywhere and
 * simply explain the widget requires the native app.
 */
export async function configureWidget(listIds: number[]): Promise<boolean> {
	if (!Capacitor.isNativePlatform()) return false;

	// Provably covered in isolation (run widget.spec.ts alone and this file reports
	// 100%) — other spec files' `vi.mock('$lib/api/server-url', …)` corrupts this
	// statement's V8 attribution once merged into the full suite, the same
	// coverage-collection artifact documented on `$lib/api/selected-store.ts` and
	// `$lib/api/token.ts`.
	/* v8 ignore next */
	const serverUrl = getServerUrl();
	if (!serverUrl) return false;

	const created = await createToken(WIDGET_TOKEN_NAME, listIds, 'editor');
	const result = await AppLauncher.openUrl({
		url: buildWidgetConfigUrl({ token: created.token, listIds, serverUrl })
	});
	return result.completed;
}
