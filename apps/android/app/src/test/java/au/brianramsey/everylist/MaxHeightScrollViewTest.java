package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * Unit tests for {@link MaxHeightScrollView} — a plain ScrollView has no android:maxHeight
 * styleable, so this caps its own measured height. A child taller than the cap is attached so the
 * ScrollView actually wants more room than the cap allows; without that the view would measure to
 * 0 and every assertion would pass whether or not the cap ran.
 */
@RunWith(RobolectricTestRunner.class)
public class MaxHeightScrollViewTest {

    private static final int CAP_PX = 200;
    private static final int VIEWPORT_WIDTH_PX = 500;
    private static final int TALL_CHILD_PX = 5000;

    private MaxHeightScrollView viewWithTallChild() {
        Context context = ApplicationProvider.getApplicationContext();
        MaxHeightScrollView v = new MaxHeightScrollView(context, null);
        v.setMaxHeightPx(CAP_PX);
        View child = new View(context);
        // A plain child needs an explicit minimum height: a bare View measures to 0, and would make
        // the ScrollView measure to 0 regardless of the cap.
        child.setMinimumHeight(TALL_CHILD_PX);
        v.addView(child, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, TALL_CHILD_PX));
        return v;
    }

    @Test
    public void capsHeightToTheMaximumWhenTheParentOffersAtMost() {
        MaxHeightScrollView v = viewWithTallChild();
        int heightSpec = View.MeasureSpec.makeMeasureSpec(10_000, View.MeasureSpec.AT_MOST);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(VIEWPORT_WIDTH_PX, View.MeasureSpec.EXACTLY), heightSpec);
        assertEquals("an AT_MOST constraint should be capped to maxHeightPx", CAP_PX, v.getMeasuredHeight());
    }

    @Test
    public void capsHeightWhenUnspecified() {
        MaxHeightScrollView v = viewWithTallChild();
        int heightSpec = View.MeasureSpec.makeMeasureSpec(10_000, View.MeasureSpec.UNSPECIFIED);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(VIEWPORT_WIDTH_PX, View.MeasureSpec.EXACTLY), heightSpec);
        assertEquals("an UNSPECIFIED constraint should be capped to maxHeightPx", CAP_PX, v.getMeasuredHeight());
    }

    @Test
    public void honorsAnExactlyHeightRatherThanTheCap() {
        MaxHeightScrollView v = viewWithTallChild();
        int forced = 100;
        int heightSpec = View.MeasureSpec.makeMeasureSpec(forced, View.MeasureSpec.EXACTLY);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(VIEWPORT_WIDTH_PX, View.MeasureSpec.EXACTLY), heightSpec);
        assertEquals("an EXACTLY height must be honored, not overridden by the cap",
            forced, v.getMeasuredHeight());
    }

    @Test
    public void wrapsContentWhenTheTallChildIsShorterThanTheCap() {
        Context context = ApplicationProvider.getApplicationContext();
        MaxHeightScrollView v = new MaxHeightScrollView(context, null);
        v.setMaxHeightPx(CAP_PX);
        View child = new View(context);
        child.setMinimumHeight(50);
        v.addView(child, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 50));

        int heightSpec = View.MeasureSpec.makeMeasureSpec(10_000, View.MeasureSpec.AT_MOST);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(VIEWPORT_WIDTH_PX, View.MeasureSpec.EXACTLY), heightSpec);

        assertEquals("the ScrollView should wrap the 50px child, not stretch it to the cap",
            50, v.getMeasuredHeight());
    }
}
