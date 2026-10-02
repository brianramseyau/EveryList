package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Looper;

import androidx.test.core.app.ApplicationProvider;

import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.IOException;
import java.util.function.BooleanSupplier;

/**
 * Unit tests for {@link DeadlineNotificationActionReceiver} — the notification's "Complete" action
 * handled entirely in the background. The receiver is registered dynamically (Robolectric doesn't
 * auto-instantiate manifest receivers) and fed the same extras the patched plugin's
 * PendingIntent carries. The API is driven through the {@link HttpJson} transport seam, and the
 * fallback notification is asserted via Robolectric's NotificationManager shadow.
 */
@RunWith(RobolectricTestRunner.class)
public class DeadlineNotificationActionReceiverTest {

    private static final long LIST_ID = 74L;
    private static final long ITEM_ID = 11L;

    private Context context;
    private RecordingTransport transport;
    private DeadlineNotificationActionReceiver receiver;

    @Before
    public void setUp() {
        // Drain any broadcast work a previously-run test class left queued on the process-wide
        // EveryListWidget executor before installing this test's transport. Robolectric caches
        // sandboxes per (SDK, config), so those statics persist across test classes — without
        // this, a late refresh from an earlier class can record into this class's transport.
        EveryListWidget.awaitIdleForTesting();
        context = ApplicationProvider.getApplicationContext();
        AuthPrefs.save(context, "sess_token", "http://server");

        transport = new RecordingTransport();
        HttpJson.setTransportForTesting(transport);

        receiver = new DeadlineNotificationActionReceiver();
        context.registerReceiver(receiver, new IntentFilter("au.brianramsey.everylist.TEST_COMPLETE"));
    }

    @After
    public void tearDown() {
        // Drain this class's whole async chain while its transport is still installed, so none of
        // it can run against a later test's transport. `complete` calls EveryListWidget
        // .broadcastRefreshAll on this receiver's own executor; Robolectric then queues the
        // broadcast on the main looper, and delivering it queues the refresh on
        // EveryListWidget.EXECUTOR — so it takes a main-looper idle *then* an executor drain,
        // repeated until both are quiet, to fully settle.
        for (int i = 0; i < 4; i++) {
            shadowOf(Looper.getMainLooper()).idle();
            EveryListWidget.awaitIdleForTesting();
        }
        try {
            context.unregisterReceiver(receiver);
        } catch (IllegalArgumentException ignored) {
            // not registered (e.g. a test that skipped setUp); ignore
        }
        HttpJson.resetTransportForTesting();
    }

    private String payload(long listId, long itemId) {
        try {
            JSONObject extra = new JSONObject().put("listId", listId).put("itemId", itemId);
            return new JSONObject().put("id", ITEM_ID).put("extra", extra).toString();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private void send(Integer notificationId, String actionId, String notificationJson) {
        Intent intent = new Intent("au.brianramsey.everylist.TEST_COMPLETE");
        if (notificationId != null) {
            intent.putExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, notificationId.intValue());
        }
        if (actionId != null) intent.putExtra(LocalNotificationManager.ACTION_INTENT_KEY, actionId);
        if (notificationJson != null) {
            intent.putExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY, notificationJson);
        }
        context.sendBroadcast(intent);
        shadowOf(Looper.getMainLooper()).idle();
    }

    private void await(BooleanSupplier condition) {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle();
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

    private boolean fallbackNotificationShown() {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return shadowOf(manager).size() > 0;
    }

    @Test
    public void missingExtrasAreIgnored() {
        send(null, null, null);
        assertTrue(transport.calls().isEmpty());
    }

    @Test
    public void malformedNotificationJsonShowsTheFallback() {
        send(11, "complete", "not json");
        await(this::fallbackNotificationShown);
        assertTrue(transport.calls().isEmpty());
    }

    @Test
    public void noMirroredAuthShowsTheFallback() {
        AuthPrefs.clear(context);
        send(11, "complete", payload(LIST_ID, ITEM_ID));
        await(this::fallbackNotificationShown);
        assertTrue(transport.calls().isEmpty());
    }

    @Test
    public void completePatchesTheItemChecked() throws Exception {
        send(11, "complete", payload(LIST_ID, ITEM_ID));
        await(() -> !transport.calls().isEmpty());

        RecordingTransport.Call call = transport.get(0);
        assertEquals("PATCH", call.method);
        assertEquals("http://server/api/v1/lists/74/items/11", call.url);
        assertTrue(new JSONObject(call.body).getBoolean("checked"));
    }

    @Test
    public void completePatchesCheckedThenRefreshesPlacedWidgets() {
        // EveryListWidget.broadcastRefreshAll is what keeps a placed widget from showing this
        // now-completed item until its next tick. Register a placed widget and a probe for the
        // refresh broadcast it should receive.
        android.appwidget.AppWidgetManager manager = android.appwidget.AppWidgetManager.getInstance(context);
        shadowOf(manager).createWidget(EveryListWidget.class, R.layout.widget_everylist);
        final boolean[] refreshed = {false};
        context.registerReceiver(new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                refreshed[0] = true;
            }
        }, new IntentFilter(EveryListWidget.ACTION_REFRESH));

        send(11, "complete", payload(LIST_ID, ITEM_ID));

        await(() -> !transport.calls().isEmpty());
        assertEquals("PATCH", transport.get(0).method);
        await(() -> refreshed[0]);
        assertTrue("a completed item must refresh placed widgets", refreshed[0]);
    }

    @Test
    public void aFailedCompleteShowsTheFallback() {
        transport.failAlways(new IOException("API returned 500"));
        send(11, "complete", payload(LIST_ID, ITEM_ID));
        await(this::fallbackNotificationShown);
    }
}
