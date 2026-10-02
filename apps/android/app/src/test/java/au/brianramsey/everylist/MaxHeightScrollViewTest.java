package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.view.View;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * Unit tests for {@link MaxHeightScrollView} — a plain ScrollView has no android:maxHeight
 * styleable, so this caps its own measured height. Verifies the cap applies under an AT_MOST
 * constraint but is not applied when the parent forces an EXACTLY height.
 */
@RunWith(RobolectricTestRunner.class)
public class MaxHeightScrollViewTest {

    private static final int CAP_PX = 480;

    private MaxHeightScrollView view() {
        MaxHeightScrollView v = new MaxHeightScrollView(
            ApplicationProvider.getApplicationContext(), null);
        v.setMaxHeightPx(CAP_PX);
        return v;
    }

    @Test
    public void capsHeightWhenTheParentOffersAtMost() {
        MaxHeightScrollView v = view();
        int spec = View.MeasureSpec.makeMeasureSpec(10_000, View.MeasureSpec.AT_MOST);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), spec);
        assertTrue("measured height " + v.getMeasuredHeight() + " should be within the cap",
            v.getMeasuredHeight() <= CAP_PX);
    }

    @Test
    public void capsHeightWhenUnspecified() {
        MaxHeightScrollView v = view();
        int spec = View.MeasureSpec.makeMeasureSpec(10_000, View.MeasureSpec.UNSPECIFIED);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), spec);
        assertTrue(v.getMeasuredHeight() <= CAP_PX);
    }

    @Test
    public void honorsAnExactlyHeightRatherThanTheCap() {
        MaxHeightScrollView v = view();
        int forced = 200;
        int spec = View.MeasureSpec.makeMeasureSpec(forced, View.MeasureSpec.EXACTLY);
        v.onMeasure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), spec);
        assertEquals("an EXACTLY height must be honored, not overridden by the cap",
            forced, v.getMeasuredHeight());
    }
}
