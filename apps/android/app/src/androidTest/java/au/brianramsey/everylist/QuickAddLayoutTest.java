package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * On-device layout checks for the widget's "+" quick-add popup (QuickAddActivity), verifying the
 * Add button stays anchored to the right edge of its row in every deadline state — that's the
 * regression this guards: the row's weight-1 deadline-preview spacer used to be GONE when no
 * deadline was picked, collapsing the flexible space and letting Add slide left to sit right next
 * to the clock. Also covers the deadlines-off list, where the clock and preview are hidden
 * entirely and Add must still sit right.
 *
 * <p>Runs as an instrumented test because the popup is exported=false — it can only be launched by
 * the app's own uid (an explicit PendingIntent in production), so an adb `am start` can't reach
 * it. ActivityScenario launches it in-process. Also writes a screenshot of each state to the
 * app's external files dir for eyeballing.
 */
@RunWith(AndroidJUnit4.class)
public class QuickAddLayoutTest {

    /** Fake widget ids used only to key per-instance prefs; never a real placed widget. */
    private static final int DEADLINE_ON_ID = 9001;
    private static final int DEADLINE_OFF_ID = 9002;

    private interface ActivityCheck {
        void run(QuickAddActivity activity) throws Exception;
    }

    private Context target() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    /** Seeds the global credentials plus this fake widget's per-instance prefs, mirroring what a
     *  real provisioned widget looks like. */
    private void seed(int widgetId, boolean useDeadline) {
        Context ctx = target();
        WidgetPrefs.saveGlobalCredentials(ctx, "elt_test", 1L, "http://10.0.2.2:3334",
            Collections.singletonList(74L));
        WidgetPrefs prefs = new WidgetPrefs(ctx, widgetId);
        prefs.setListId(74L);
        prefs.setListName("TODO");
        prefs.setUseDeadline(useDeadline);
    }

    private Intent intentFor(int widgetId) {
        return new Intent(target(), QuickAddActivity.class)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, widgetId)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** Launches the popup and runs {@code check} after the first real layout pass (so view
     *  geometry is populated), on the main thread. */
    private void withLaidOutActivity(int widgetId, ActivityCheck check) throws Exception {
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intentFor(widgetId))) {
            final CountDownLatch latch = new CountDownLatch(1);
            final Throwable[] error = new Throwable[1];
            scenario.onActivity(activity -> activity.getWindow().getDecorView().post(() -> {
                try {
                    check.run(activity);
                } catch (Throwable t) {
                    error[0] = t;
                } finally {
                    latch.countDown();
                }
            }));
            assertTrue("layout callback timed out", latch.await(10, TimeUnit.SECONDS));
            if (error[0] != null) {
                throw new AssertionError(error[0]);
            }
        }
    }

    private void assertAnchoredRight(View save, String label) {
        View row = (View) save.getParent();
        int rowContentRight = row.getWidth() - row.getPaddingRight();
        int gap = rowContentRight - save.getRight();
        assertTrue(
            label + ": Add button right edge is " + gap
                + "px short of the row's content right edge (expected within 2dp)",
            gap >= 0 && gap <= dp(2));
    }

    private int dp(int value) {
        return Math.round(value * target().getResources().getDisplayMetrics().density);
    }

    private void writeScreenshot(QuickAddActivity activity, String name) throws Exception {
        View decor = activity.getWindow().getDecorView();
        assertTrue(name + ": decor not laid out", decor.getWidth() > 0 && decor.getHeight() > 0);
        Bitmap bitmap = Bitmap.createBitmap(decor.getWidth(), decor.getHeight(), Bitmap.Config.ARGB_8888);
        decor.draw(new Canvas(bitmap));
        File out = new File(target().getExternalFilesDir(null), name + ".png");
        try (FileOutputStream fos = new FileOutputStream(out)) {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos);
        }
        assertTrue(name + ": screenshot not written", out.length() > 0);
    }

    @Test
    public void addStaysRightWithNoDeadlinePicked() throws Exception {
        seed(DEADLINE_ON_ID, true);
        withLaidOutActivity(DEADLINE_ON_ID, activity -> {
            View save = activity.findViewById(R.id.quick_add_save);
            TextView preview = activity.findViewById(R.id.quick_add_deadline_preview);
            View clock = activity.findViewById(R.id.quick_add_deadline);

            assertEquals("preview should stay visible as the spacer",
                View.VISIBLE, preview.getVisibility());
            assertEquals("clock should be shown on a deadlines-on list",
                View.VISIBLE, clock.getVisibility());
            assertEquals("preview should show the placeholder when nothing is picked",
                activity.getString(R.string.quick_add_deadline), preview.getText().toString());
            assertAnchoredRight(save, "no deadline picked");
            writeScreenshot(activity, "quick_add_no_deadline");
        });
    }

    @Test
    public void addStaysRightWithDeadlinePicked() throws Exception {
        seed(DEADLINE_ON_ID, true);
        withLaidOutActivity(DEADLINE_ON_ID, activity -> {
            Method setPicked = QuickAddActivity.class.getDeclaredMethod("setPickedDeadline", String.class);
            setPicked.setAccessible(true);
            setPicked.invoke(activity, "2026-09-30T10:00");

            View save = activity.findViewById(R.id.quick_add_save);
            TextView preview = activity.findViewById(R.id.quick_add_deadline_preview);

            assertEquals("preview should be visible with a picked deadline",
                View.VISIBLE, preview.getVisibility());
            assertEquals("Sep 30, 10:00 AM", preview.getText().toString());
            assertAnchoredRight(save, "deadline picked");
            writeScreenshot(activity, "quick_add_with_deadline");
        });
    }

    @Test
    public void deadlinesOffStillAnchorsAddAndHidesControls() throws Exception {
        seed(DEADLINE_OFF_ID, false);
        withLaidOutActivity(DEADLINE_OFF_ID, activity -> {
            View save = activity.findViewById(R.id.quick_add_save);
            View preview = activity.findViewById(R.id.quick_add_deadline_preview);
            View clock = activity.findViewById(R.id.quick_add_deadline);
            TextView title = activity.findViewById(R.id.quick_add_title);

            assertNotNull(title.getText());
            assertTrue("popup title should name the list", title.getText().length() > 0);
            assertEquals("clock must be hidden on a deadlines-off list",
                View.GONE, clock.getVisibility());
            assertEquals("preview must be hidden on a deadlines-off list",
                View.GONE, preview.getVisibility());
            // The end gravity on the row is what holds Add right once its weight-1 spacer is gone.
            assertAnchoredRight(save, "deadlines off");
            writeScreenshot(activity, "quick_add_no_deadline_feature");
        });
    }
}
