package au.brianramsey.everylist;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.MotionEvent;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * Unit tests for {@link RefreshGestureAwareLayout}'s gesture heuristics — the touch-time
 * disambiguation between a real pull-to-refresh and the web app's own reorder-drag/swipe-reveal
 * gestures. This is the piece that used to live inside {@code MainActivity}, where it needed a
 * live Capacitor bridge to reach; extracted so it can be driven directly.
 */
@RunWith(RobolectricTestRunner.class)
public class RefreshGestureAwareLayoutTest {

    private RefreshGestureAwareLayout layout;

    @Before
    public void setUp() {
        Context context = ApplicationProvider.getApplicationContext();
        layout = new RefreshGestureAwareLayout(context);
        // SwipeRefreshLayout's own touch handling needs a child (mTarget, for canScrollVertically)
        // and a parent (for requestDisallowInterceptTouchEvent); attach it inside a plain
        // FrameLayout with a plain scrollable-free child.
        android.widget.FrameLayout parent = new android.widget.FrameLayout(context);
        layout.addView(new android.view.View(context),
            new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        parent.addView(layout);
    }

    private static MotionEvent down(float x, float y) {
        return MotionEvent.obtain(0, 0, MotionEvent.ACTION_DOWN, x, y, 0);
    }

    private static MotionEvent move(float x, float y) {
        return MotionEvent.obtain(0, 10, MotionEvent.ACTION_MOVE, x, y, 0);
    }

    private static MotionEvent up(float x, float y) {
        return MotionEvent.obtain(0, 20, MotionEvent.ACTION_UP, x, y, 0);
    }

    @Test
    public void aVerticallyDominantMoveBeyondTheSlopKeepsRefreshEnabled() {
        layout.dispatchTouchEvent(down(100, 100));
        layout.dispatchTouchEvent(move(100, 160));
        assertTrue("a real pull should leave refresh enabled", layout.isEnabled());
    }

    @Test
    public void aHorizontallyDominantMoveBeyondTheSlopDisablesRefresh() {
        layout.dispatchTouchEvent(down(100, 100));
        layout.dispatchTouchEvent(move(180, 105));
        assertFalse("a swipe-reveal should disable refresh", layout.isEnabled());
    }

    @Test
    public void aMoveInsideTheSlopDoesNotDisableRefresh() {
        layout.dispatchTouchEvent(down(100, 100));
        layout.dispatchTouchEvent(move(105, 105));
        assertTrue(layout.isEnabled());
    }

    @Test
    public void aLongHoldBeforeMovingDisablesRefreshForTheRestOfTheGesture() {
        layout.dispatchTouchEvent(down(100, 100));
        // Simulate the 400ms reorder-drag hold by moving the internal clock: sleep past it, then
        // move vertically (as a reorder drag would).
        try {
            Thread.sleep(450);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        layout.dispatchTouchEvent(move(100, 200));
        assertFalse("a held-then-dragged gesture should be treated as a reorder, not a refresh",
            layout.isEnabled());
    }

    @Test
    public void liftingTheFingerReenablesRefresh() {
        layout.dispatchTouchEvent(down(100, 100));
        layout.dispatchTouchEvent(up(100, 200));
        assertTrue(layout.isEnabled());
    }

    @Test
    public void setExternallyEnabledFalseSuppressesRefresh() {
        layout.setExternallyEnabled(false);
        assertFalse(layout.isEnabled());
    }

    @Test
    public void aDownEventDoesNotReenableRefreshWhileExternallySuppressed() {
        layout.setExternallyEnabled(false);
        layout.dispatchTouchEvent(down(100, 100));
        layout.dispatchTouchEvent(up(100, 100));
        assertFalse("an external suppression window must survive a stray touch", layout.isEnabled());
    }
}
