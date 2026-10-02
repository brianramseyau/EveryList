import Foundation

/// The one decision `SpaFallbackRouter` makes, pulled out as a free function so it can be unit
/// tested without a live Capacitor `Router` (see `EveryListTests`).
///
/// Capacitor's default `Router` resolves any extensionless path — a client route or the real "/"
/// request alike — to `index.html`, with no way to point it at this project's SPA-fallback file,
/// `200.html` (chosen instead of the default name specifically to avoid colliding with the real
/// prerendered "/" page — see the fallback comment in `apps/web/vite.config.ts`). Reloading
/// anywhere but the app's root route served that real prerendered "/" page's content instead of
/// the current route, silently bouncing the user back to the root list view
/// (PLAN_13_PHASE_NATIVE_APP_SHELL.md §4). `MainViewController.router()` overrides Capacitor's
/// supported hook and resolves the fallback here instead.
///
/// The check is scoped to the exact literal path `/index.html` rather than "any extensionless
/// path": Capacitor passes that literal for the SPA-fallback branch, but routes every real asset
/// request through the same `Router` too, so matching more broadly would hand `200.html` back for
/// every `.js`/`.css` load.
///
/// - Parameters:
///   - basePath: the server base path (empty for this app).
///   - path: the path Capacitor is resolving.
/// - Returns: `basePath + "/200.html"` for the fallback literal, otherwise `basePath + path`.
func spaFallbackPath(basePath: String, path: String) -> String {
    path == "/index.html" ? basePath + "/200.html" : basePath + path
}
