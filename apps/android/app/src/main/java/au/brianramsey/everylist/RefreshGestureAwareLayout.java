package au.brianramsey.everylist;

import android.content.Context;
import android.view.MotionEvent;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * A pull-to-refresh layout that can tell a real pull apart from the web app's own gestures.
 * Extracted from {@link MainActivity} into its own class so its touch heuristics are reachable by
 * a JVM unit test (the class itself only needs a {@link Context}, not a live Capacitor bridge).
 *
 * <p>A plain {@code SwipeRefreshLayout} can't tell a pull-to-refresh apart from the web app's own
 * long-press-then-drag list reordering (sortable-reorder.ts's {@code delay: 400}) — both look
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
 *
 * <p>The hold-time check runs before the move-slop check (not after) so that ordinary finger
 * jitter during the hold-still window can't lock in "moved" — and therefore skip the
 * disable — before the 400ms mark is reached; a reorder drag that starts before the threshold
 * fires is rare enough that favoring the hold check first doesn't hurt real pulls, which
 * clear the slop almost immediately anyway.
 *
 * <p>A second disambiguator handles the web app's own list-item swipe-to-reveal actions
 * (swipe-reveal.ts), which — being a quick horizontal gesture — never reaches the hold
 * threshold: once a move clears the slop within that window, its direction is checked, and a
 * horizontally-dominant move disables the refresh layout immediately rather than leaving it
 * enabled to contest the touch with the row's own JS gesture handling.
 */
final class RefreshGestureAwareLayout extends SwipeRefreshLayout {
    private static final long HOLD_THRESHOLD_MS = 400;
    private static final int MOVE_SLOP_PX = 20;

    private float downX;
    private float downY;
    private long downTimeMs;
    private boolean moved;

    // Set false for as long as a caller (currently just PullToRefreshControlPlugin, on
    // behalf of the undo toast's swipe-to-dismiss gesture) has claimed a vertical drag can't
    // be a refresh — see setExternallyEnabled's doc. While false, dispatchTouchEvent's own
    // ACTION_DOWN/ACTION_UP/ACTION_CANCEL branches must not re-enable the layout out from
    // under it.
    private boolean externallyEnabled = true;

    RefreshGestureAwareLayout(Context context) {
        super(context);
    }

    /**
     * Overrides this layout's own gesture heuristics for the duration of a caller-declared
     * suppression window, rather than contesting each touch stream. See
     * MainActivity#setPullToRefreshEnabled and pull-to-refresh.ts's doc comment for why: the
     * undo toast's swipe-to-dismiss is a plain vertical drag with no hold delay, the same
     * shape as a real pull, so there's no timing/direction signal left for
     * dispatchTouchEvent's own checks to key off — the caller has to say so directly.
     */
    void setExternallyEnabled(boolean enabled) {
        externallyEnabled = enabled;
        setEnabled(enabled);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                downX = event.getRawX();
                downY = event.getRawY();
                downTimeMs = System.currentTimeMillis();
                moved = false;
                if (externallyEnabled) setEnabled(true);
                break;
            case MotionEvent.ACTION_MOVE:
                if (!moved) {
                    if (System.currentTimeMillis() - downTimeMs > HOLD_THRESHOLD_MS) {
                        moved = true;
                        setEnabled(false);
                    } else {
                        float dx = event.getRawX() - downX;
                        float dy = event.getRawY() - downY;
                        if (Math.hypot(dx, dy) > MOVE_SLOP_PX) {
                            moved = true;
                            if (Math.abs(dx) > Math.abs(dy)) {
                                setEnabled(false);
                            }
                        }
                    }
                }
                break;
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (externallyEnabled) setEnabled(true);
                break;
            default:
                break;
        }
        return super.dispatchTouchEvent(event);
    }
}
