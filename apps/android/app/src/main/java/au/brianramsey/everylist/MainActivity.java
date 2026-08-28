package au.brianramsey.everylist;

import android.content.Context;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.ProcessedRoute;
import com.getcapacitor.RouteProcessor;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be set before super.onCreate() builds the Bridge (which is what actually reads
        // it) — see setSpaFallbackRoute()'s doc comment for why this is needed at all.
        setSpaFallbackRoute();
        super.onCreate(savedInstanceState);
        // In-app widget provisioning channel (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md) — lets the web app hand the
        // widget's scoped PAT to native storage without putting it in a loggable URL.
        registerPlugin(EveryListWidgetPlugin.class);
        if (BuildConfig.DEBUG) {
            // Capacitor serves the app itself over https://localhost, and Chromium's Mixed
            // Content policy blocks a plain http:// fetch from an https:// page regardless of
            // the OS-level cleartext-traffic policy (network_security_config.xml, debug-only,
            // covers that separate check). Needed to reach a local dev API server (e.g.
            // http://10.0.2.2:PORT) from the emulator. BuildConfig.DEBUG keeps this out of
            // release builds, which keep the default MIXED_CONTENT_NEVER_ALLOW.
            getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        setUpPullToRefresh();
    }

    /**
     * Capacitor's local server hard-codes its SPA-fallback file to `index.html` for any
     * unmatched extensionless path (WebViewLocalServer#handleLocalRequest) — with no way to
     * point it at this project's fallback file, `200.html` (chosen instead of the default name
     * specifically to avoid colliding with the real prerendered "/" page — see the fallback
     * comment in apps/web/vite.config.ts). Reloading anywhere but the app's root route served
     * that real prerendered "/" page's content instead of the current route — its own client
     * logic (e.g. an auth redirect to /lists) then took over, silently bouncing the user back to
     * the root list view instead of refreshing what they were actually looking at (PLAN_13_PHASE_NATIVE_APP_SHELL.md
     * §4). A RouteProcessor is Capacitor's own supported override for this exact hook — it
     * resolves the fallback to 200.html instead, the minimal SPA shell adapter-static builds
     * specifically for the client router to take over from `location.pathname`.
     *
     * <p>Once set, this same RouteProcessor is <em>also</em> consulted for every regular asset
     * request (WebViewLocalServer's generic PathHandler#handle, used for every .js/.css/etc.
     * file) — not just the SPA-fallback branch that motivated adding it, which always passes the
     * literal path "/index.html" regardless of what was actually requested. Redirecting
     * unconditionally broke every asset load (each one also got 200.html's content back, "SyntaxError:
     * Unexpected token '&lt;'" on whichever chunk loaded first). Checking for that exact literal
     * keeps the fallback fix scoped to the one branch that actually needs it and passes every
     * real asset path through unchanged.
     */
    private void setSpaFallbackRoute() {
        bridgeBuilder.setRouteProcessor(
            (basePath, path) -> {
                ProcessedRoute route = new ProcessedRoute();
                route.setPath("/index.html".equals(path) ? basePath + "/200.html" : basePath + path);
                route.setAsset(true);
                return route;
            }
        );
    }

    /**
     * Android's WebView has no pull-to-refresh gesture of its own — that's a Chrome browser-tab
     * UI feature, not part of the platform WebView API a hybrid app embeds — so it's wired up
     * manually here with a native SwipeRefreshLayout, matching iOS's UIRefreshControl
     * (MainViewController.swift) and giving the same manual-resync affordance as the "Refresh
     * now" button in Settings → Sync Status (PLAN_13_PHASE_NATIVE_APP_SHELL.md §4). Reloading is the same action
     * either way, and both reach the same fixed SPA-fallback routing (see §4's native
     * SPA-fallback bug note).
     */
    private void setUpPullToRefresh() {
        WebView webView = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) webView.getParent();
        int index = parent.indexOfChild(webView);
        ViewGroup.LayoutParams webViewParams = webView.getLayoutParams();

        parent.removeView(webView);

        SwipeRefreshLayout swipeRefreshLayout = new RefreshGestureAwareLayout(this);
        swipeRefreshLayout.setLayoutParams(webViewParams);
        swipeRefreshLayout.addView(
            webView,
            new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        );
        parent.addView(swipeRefreshLayout, index);

        swipeRefreshLayout.setOnRefreshListener(webView::reload);

        // WebViewListener is Capacitor's own supported hook for this (see Bridge#addWebViewListener)
        // — avoids replacing Capacitor's internal BridgeWebViewClient, which handles local asset
        // routing and would be risky to reimplement just to know when a reload finishes.
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView webView) {
                        swipeRefreshLayout.setRefreshing(false);
                    }

                    @Override
                    public void onReceivedError(WebView webView) {
                        swipeRefreshLayout.setRefreshing(false);
                    }

                    @Override
                    public void onReceivedHttpError(WebView webView) {
                        swipeRefreshLayout.setRefreshing(false);
                    }
                }
            );
    }

    /**
     * A plain SwipeRefreshLayout can't tell a pull-to-refresh apart from the web app's own
     * long-press-then-drag list reordering (sortable-reorder.ts's `delay: 400`) — both look
     * identical at the point that matters: a downward drag starting on content that's already
     * scrolled to the top, which is exactly the condition SwipeRefreshLayout watches for. By the
     * time the reorder drag's own JS actually starts (after its own 400ms hold) and tries to keep
     * the gesture for itself via preventDefault, this layout has *already* claimed the touch
     * stream natively (WebView only defers to a JS preventDefault on the very first touchmove of a
     * sequence) — the drag never gets a further chance and the swipe is read as a refresh instead.
     *
     * <p>Matching that same 400ms threshold here — before SwipeRefreshLayout's own gesture
     * detection ever sees a move — disambiguates the two up front: a real pull starts moving
     * (almost) right away, while a reorder drag sits still past the threshold first. Once a touch
     * has been held that long with no real movement yet, this stops treating the gesture as a
     * refresh candidate for the rest of that touch sequence; a genuine pull that's already in
     * motion by then is left alone.
     */
    private static final class RefreshGestureAwareLayout extends SwipeRefreshLayout {
        private static final long HOLD_THRESHOLD_MS = 400;
        private static final int MOVE_SLOP_PX = 20;

        private float downX;
        private float downY;
        private long downTimeMs;
        private boolean moved;

        RefreshGestureAwareLayout(Context context) {
            super(context);
        }

        @Override
        public boolean dispatchTouchEvent(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = event.getRawX();
                    downY = event.getRawY();
                    downTimeMs = System.currentTimeMillis();
                    moved = false;
                    setEnabled(true);
                    break;
                case MotionEvent.ACTION_MOVE:
                    if (!moved) {
                        float dx = event.getRawX() - downX;
                        float dy = event.getRawY() - downY;
                        if (Math.hypot(dx, dy) > MOVE_SLOP_PX) {
                            moved = true;
                        } else if (System.currentTimeMillis() - downTimeMs > HOLD_THRESHOLD_MS) {
                            setEnabled(false);
                        }
                    }
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    setEnabled(true);
                    break;
                default:
                    break;
            }
            return super.dispatchTouchEvent(event);
        }
    }
}
