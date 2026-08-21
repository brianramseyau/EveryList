import Capacitor
import UIKit

/// Capacitor's default `Router` (`CapacitorRouter`) resolves any extensionless path — a client
/// route or the real "/" request alike — to `index.html`, with no way to point it at this
/// project's SPA-fallback file, `200.html` (chosen instead of the default name specifically to
/// avoid colliding with the real prerendered "/" page — see the fallback comment in
/// apps/web/vite.config.ts). Reloading anywhere but the app's root route served that real
/// prerendered "/" page's content instead of the current route — its own client logic (e.g. an
/// auth redirect to /lists) then took over, silently bouncing the user back to the root list view
/// instead of refreshing what they were actually looking at (PHASE13_PLAN.md §4). Overriding
/// `router()` is Capacitor's own supported hook for this — resolves the fallback to 200.html
/// instead, the minimal SPA shell adapter-static builds specifically for the client router to
/// take over from `location.pathname`.
private struct SpaFallbackRouter: Router {
    var basePath: String = ""
    func route(for path: String) -> String {
        let pathUrl = URL(fileURLWithPath: path)
        if pathUrl.pathExtension.isEmpty {
            return basePath + "/200.html"
        }
        return basePath + path
    }
}

/// WKWebView has no pull-to-refresh gesture of its own — wires up a native UIRefreshControl on
/// its scroll view instead, matching Android's SwipeRefreshLayout counterpart
/// (MainActivity.java#setUpPullToRefresh) and giving the same manual-resync affordance as the
/// "Refresh now" button in Settings → Sync Status (PHASE13_PLAN.md §4). Reloading is the same
/// action either way, and both reach the same fixed SPA-fallback routing above.
class MainViewController: CAPBridgeViewController {
    private var isLoadingObservation: NSKeyValueObservation?

    override func router() -> Router {
        SpaFallbackRouter()
    }

    // Mirrors --color-paper / --color-ink from apps/web/src/routes/layout.css. The rubber-band
    // overscroll region above content is the scroll view's own background showing through — with
    // no color set it defaults to plain white, which doesn't match the app's cream/dark theme.
    // There's no live channel from the web layer's theme setting (light/dark/automatic, stored in
    // localStorage) to native code, so this follows the system appearance instead — matches the
    // common case (most users leave the in-app setting on "automatic") without needing a bridge
    // call just for this.
    private func paperColor() -> UIColor {
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0x1b / 255, green: 0x1d / 255, blue: 0x1f / 255, alpha: 1)
            : UIColor(red: 0xf6 / 255, green: 0xf5 / 255, blue: 0xf1 / 255, alpha: 1)
    }

    private func inkColor() -> UIColor {
        traitCollection.userInterfaceStyle == .dark
            ? UIColor(red: 0xed / 255, green: 0xea / 255, blue: 0xe3 / 255, alpha: 1)
            : UIColor(red: 0x20 / 255, green: 0x1f / 255, blue: 0x1d / 255, alpha: 1)
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        webView?.scrollView.backgroundColor = paperColor()
        (webView?.scrollView.refreshControl as? UIRefreshControl)?.tintColor = inkColor()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }

        // UIRefreshControl only activates on overscroll past the top — a scroll view that has no
        // natural scroll room (a short page, or with bounce off) never lets a downward drag reach
        // it at all. Forcing bounce on regardless of content height is what lets the gesture
        // register even on a page like Settings that might not scroll on its own.
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true
        webView.scrollView.backgroundColor = paperColor()

        let refreshControl = UIRefreshControl()
        refreshControl.tintColor = inkColor()
        refreshControl.addTarget(self, action: #selector(handleRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

        // CAPBridgeViewController's own WKNavigationDelegate is internal, with no public
        // "navigation finished" hook to observe from a subclass — WKWebView's `isLoading` is a
        // standard, delegate-independent KVO property, so it works regardless of that.
        isLoadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak refreshControl] webView, _ in
            guard !webView.isLoading else { return }
            DispatchQueue.main.async {
                refreshControl?.endRefreshing()
            }
        }
    }

    @objc private func handleRefresh() {
        webView?.reload()
    }
}
