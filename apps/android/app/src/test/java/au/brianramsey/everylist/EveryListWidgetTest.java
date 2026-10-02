package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Looper;

import androidx.test.core.app.ApplicationProvider;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.Collections;
import java.util.function.BooleanSupplier;

/**
 * Unit tests for {@link EveryListWidget}'s broadcast dispatch. Robolectric doesn't auto-instantiate
 * a manifest-declared receiver, so each test registers the provider dynamically for the actions it
 * dispatches to (the same registration the system performs for a manifest receiver), then idles the
 * main looper to deliver. The refresh/toggle work itself runs on the receiver's own executor, held
 * open by {@code goAsync()} exactly as in production.
 */
@RunWith(RobolectricTestRunner.class)
public class EveryListWidgetTest {

    private static final long LIST_ID = 74L;

    private Context context;
    private RecordingTransport transport;
    private int widgetId;

    @Before
    public void setUp() {
        // Drain any broadcast work a previously-run test class left queued on the process-wide
        // EveryListWidget executor before installing this test's transport. Robolectric caches
        // sandboxes per (SDK, config), so those statics persist across test classes — without
        // this, a late refresh from an earlier class can record into this class's transport.
        EveryListWidget.awaitIdleForTesting();

        context = ApplicationProvider.getApplicationContext();
        widgetId = shadowOf(AppWidgetManager.getInstance(context))
            .createWidget(EveryListWidget.class, R.layout.widget_everylist);

        context.getSharedPreferences(WidgetPrefs.GLOBAL_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("widget_" + widgetId, Context.MODE_PRIVATE).edit().clear().commit();

        transport = new RecordingTransport();
        transport.respondWith("{\"data\":{\"listName\":\"TODO\",\"useDeadline\":false,\"items\":[]}}");
        HttpJson.setTransportForTesting(transport);

        WidgetPrefs.saveGlobalCredentials(context, "elt_abc", 7L, "http://server", Collections.singletonList(LIST_ID));
        WidgetPrefs prefs = new WidgetPrefs(context, widgetId);
        prefs.setListId(LIST_ID);
        prefs.setListName("TODO");

        IntentFilter filter = new IntentFilter();
        filter.addAction(EveryListWidget.ACTION_REFRESH);
        filter.addAction(EveryListWidget.ACTION_TOGGLE_COMPLETED);
        filter.addAction(EveryListWidget.ACTION_ITEM);
        context.registerReceiver(new EveryListWidget(), filter);
    }

    @After
    public void tearDown() {
        EveryListWidget.awaitIdleForTesting();
        HttpJson.resetTransportForTesting();
    }

    private void send(Intent intent) {
        context.sendBroadcast(intent.setPackage(context.getPackageName()));
        shadowOf(Looper.getMainLooper()).idle();
    }

    /** Waits up to ~5s for the receiver's executor to finish the work under test. */
    private void await(BooleanSupplier condition) {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) return;
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        }
        throw new AssertionError("condition not met within 5s");
    }

    private Intent widgetIntent(String action) {
        return new Intent(context, EveryListWidget.class)
            .setAction(action)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, widgetId);
    }

    @Test
    public void refreshBroadcastRunsAFetch() {
        send(widgetIntent(EveryListWidget.ACTION_REFRESH));
        await(() -> !transport.calls().isEmpty());
        assertEquals("GET", transport.last().method);
    }

    @Test
    public void toggleCompletedBroadcastFlipsThePrefAndFetches() {
        assertTrue(!new WidgetPrefs(context, widgetId).getShowCompleted());
        send(widgetIntent(EveryListWidget.ACTION_TOGGLE_COMPLETED));
        await(() -> new WidgetPrefs(context, widgetId).getShowCompleted());
        assertTrue(new WidgetPrefs(context, widgetId).getShowCompleted());
    }

    @Test
    public void openItemTapLaunchesTheAppDeepLink() {
        Intent item = new Intent(context, EveryListWidget.class)
            .setAction(EveryListWidget.ACTION_ITEM)
            .putExtra(EveryListWidget.EXTRA_ACTION, EveryListWidget.ACTION_OPEN_ITEM)
            .putExtra(EveryListWidget.EXTRA_LIST_ID, LIST_ID)
            .putExtra(EveryListWidget.EXTRA_ITEM_ID, 9L);
        send(item);

        Intent launched = shadowOf((android.app.Application) context).getNextStartedActivity();
        assertNotNull("an open-item tap should launch the app", launched);
        assertEquals(Uri.parse("everylist://lists/74/items/9"), launched.getData());
        assertTrue((launched.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0);
    }

    @Test
    public void openItemTapWithMissingIdsLaunchesNothing() {
        Intent item = new Intent(context, EveryListWidget.class)
            .setAction(EveryListWidget.ACTION_ITEM)
            .putExtra(EveryListWidget.EXTRA_ACTION, EveryListWidget.ACTION_OPEN_ITEM);
        send(item);
        assertNull(shadowOf((android.app.Application) context).getNextStartedActivity());
    }

    @Test
    public void toggleItemTapRunsTheToggleFetch() {
        Intent item = new Intent(context, EveryListWidget.class)
            .setAction(EveryListWidget.ACTION_ITEM)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, widgetId)
            .putExtra(EveryListWidget.EXTRA_ACTION, EveryListWidget.ACTION_TOGGLE_ITEM)
            .putExtra(EveryListWidget.EXTRA_LIST_ID, LIST_ID)
            .putExtra(EveryListWidget.EXTRA_ITEM_ID, 9L);
        send(item);
        await(() -> !transport.calls().isEmpty());
        assertEquals("PATCH", transport.get(0).method);
    }

    @Test
    public void anUnknownActionFallsThroughWithoutError() {
        send(new Intent(context, EveryListWidget.class).setAction("au.brianramsey.everylist.UNKNOWN"));
        assertTrue("no network work should be triggered by an unknown action", transport.calls().isEmpty());
    }

    @Test
    public void broadcastRefreshAllTargetsEveryPlacedWidget() {
        // A placed widget is registered; broadcastRefreshAll fans an explicit refresh out to it.
        EveryListWidget.broadcastRefreshAll(context);
        shadowOf(Looper.getMainLooper()).idle();
        await(() -> !transport.calls().isEmpty());
        assertEquals("GET", transport.last().method);
    }
}
