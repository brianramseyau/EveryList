package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.view.View;

import androidx.test.core.app.ActivityScenario;
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
 * Unit tests for {@link RescheduleActivity} — the deadline notification's "Reschedule" popup. Runs
 * the real Activity under Robolectric, driving the live-deadline fetch and each shortcut's PATCH
 * through the {@link HttpJson} transport seam.
 */
@RunWith(RobolectricTestRunner.class)
public class RescheduleActivityTest {

    private static final long LIST_ID = 74L;
    private static final long ITEM_ID = 11L;

    private Context context;
    private RecordingTransport transport;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        AuthPrefs.save(context, "sess_token", "http://server");
        transport = new RecordingTransport();
        HttpJson.setTransportForTesting(transport);
    }

    @After
    public void tearDown() {
        EveryListWidget.awaitIdleForTesting();
        HttpJson.resetTransportForTesting();
    }

    private String payload() {
        try {
            JSONObject extra = new JSONObject().put("listId", LIST_ID).put("itemId", ITEM_ID);
            return new JSONObject().put("id", ITEM_ID).put("extra", extra).toString();
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private Intent intent(String notificationJson) {
        return new Intent(context, RescheduleActivity.class)
            .putExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY, notificationJson)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** The GET .../items response the popup reads to find the item's live deadline. */
    private String itemsResponse(String deadline) throws Exception {
        JSONObject item = new JSONObject().put("id", ITEM_ID);
        if (deadline == null) item.put("deadline", JSONObject.NULL);
        else item.put("deadline", deadline);
        return new JSONObject().put("data", new org.json.JSONArray().put(item)).toString();
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
    public void malformedPayloadShowsTheFallbackAndFinishes() {
        ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent("not json"));
        scenario.close();
        await(this::fallbackNotificationShown);
    }

    @Test
    public void missingAuthShowsTheFallbackAndFinishes() {
        AuthPrefs.clear(context);
        ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()));
        scenario.close();
        await(this::fallbackNotificationShown);
    }

    @Test
    public void aTimedDeadlineEnablesTheOneHourShortcut() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> assertEquals(View.VISIBLE, a.findViewById(R.id.reschedule_one_hour).getVisibility()));
        }
    }

    @Test
    public void aDateOnlyDeadlineHidesTheOneHourShortcut() throws Exception {
        transport.response = itemsResponse("2026-09-30");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> assertEquals(View.GONE, a.findViewById(R.id.reschedule_one_hour).getVisibility()));
        }
    }

    @Test
    public void anItemWithNoLiveDeadlineFinishesWithoutOfferingShortcuts() throws Exception {
        transport.response = itemsResponse(null);
        ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()));
        await(() -> !transport.calls.isEmpty());
        scenario.close();
    }

    @Test
    public void anUnknownItemFinishesWithoutOfferingShortcuts() throws Exception {
        // The response has no row with this item's id.
        transport.response = "{\"data\":[{\"id\":999,\"deadline\":\"2026-09-30\"}]}";
        ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()));
        await(() -> !transport.calls.isEmpty());
        scenario.close();
    }

    @Test
    public void aFailedLiveDeadlineFetchShowsTheFallback() {
        transport.failure = new IOException("API returned 500");
        ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()));
        await(this::fallbackNotificationShown);
        scenario.close();
    }

    @Test
    public void tomorrowShortcutPatchesTheNewDeadline() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> a.findViewById(R.id.reschedule_tomorrow).performClick());
            await(() -> transport.calls.size() >= 2);

            RecordingTransport.Call patch = transport.calls.get(1);
            assertEquals("PATCH", patch.method);
            assertEquals("http://server/api/v1/lists/74/items/11", patch.url);
            assertTrue(new JSONObject(patch.body).has("deadline"));
        }
    }

    @Test
    public void theOneHourShortcutIsAvailableForATimedDeadline() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> a.findViewById(R.id.reschedule_one_hour).performClick());
            await(() -> transport.calls.size() >= 2);
            assertEquals("PATCH", transport.calls.get(1).method);
        }
    }

    @Test
    public void weekendAndNextWeekShortcutsPatchANewDeadline() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> a.findViewById(R.id.reschedule_weekend).performClick());
            await(() -> transport.calls.size() >= 2);
            assertTrue(new JSONObject(transport.calls.get(1).body).has("deadline"));

            transport.calls.clear();
            transport.response = itemsResponse("2026-09-30T10:00");
            // A fresh activity for the next-week path (this one is finishing after the PATCH).
        }
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> a.findViewById(R.id.reschedule_next_week).performClick());
            await(() -> transport.calls.size() >= 2);
            assertEquals("PATCH", transport.calls.get(1).method);
        }
    }

    @Test
    public void aFailedShortcutPatchShowsTheFallback() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            transport.failure = new IOException("API returned 500");
            scenario.onActivity(a -> a.findViewById(R.id.reschedule_tomorrow).performClick());
            await(this::fallbackNotificationShown);
        }
    }

    @Test
    public void customPickerHidesContentAndCancelRestoresIt() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> {
                a.findViewById(R.id.reschedule_custom).performClick();
                View content = a.findViewById(R.id.reschedule_scroll);
                assertEquals(View.INVISIBLE, content.getVisibility());
                android.app.Dialog dialog = org.robolectric.shadows.ShadowDialog.getLatestDialog();
                assertTrue(dialog instanceof android.app.DatePickerDialog);
                android.content.DialogInterface.OnCancelListener onCancel =
                    org.robolectric.Shadows.shadowOf((android.app.Dialog) dialog).getOnCancelListener();
                onCancel.onCancel(dialog);
                assertEquals(View.VISIBLE, content.getVisibility());
            });
        }
    }

    @Test
    public void customPickerNoTimeButtonAppliesADateOnlyDeadline() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            scenario.onActivity(a -> {
                try {
                    java.lang.reflect.Method showTime =
                        RescheduleActivity.class.getDeclaredMethod("showCustomTimePicker", int.class, int.class, int.class);
                    showTime.setAccessible(true);
                    showTime.invoke(a, 2026, 8, 30);
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
                android.app.Dialog dialog = org.robolectric.shadows.ShadowDialog.getLatestDialog();
                assertTrue(dialog instanceof android.app.TimePickerDialog);
                ((android.app.AlertDialog) dialog)
                    .getButton(android.content.DialogInterface.BUTTON_NEGATIVE).performClick();
                shadowOf(Looper.getMainLooper()).idle();
            });
            await(() -> transport.calls.size() >= 2);
            assertEquals("PATCH", transport.calls.get(1).method);
            assertTrue(new JSONObject(transport.calls.get(1).body).getString("deadline").startsWith("2026-09-30"));
        }
    }

    @Test
    public void cancelJustFinishes() throws Exception {
        transport.response = itemsResponse("2026-09-30T10:00");
        try (ActivityScenario<RescheduleActivity> scenario = ActivityScenario.launch(intent(payload()))) {
            await(() -> !transport.calls.isEmpty());
            int before = transport.calls.size();
            scenario.onActivity(a -> a.findViewById(R.id.reschedule_cancel).performClick());
            Thread.sleep(50);
            assertEquals("cancel must not PATCH anything", before, transport.calls.size());
        }
    }
}
