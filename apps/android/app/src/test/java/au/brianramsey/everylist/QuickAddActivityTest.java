package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.view.View;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.IOException;
import java.util.Collections;
import java.util.function.BooleanSupplier;

/**
 * Unit tests for {@link QuickAddActivity} — the widget's "+" popup. Runs the real Activity under
 * Robolectric and drives it through the {@link HttpJson} transport seam.
 */
@RunWith(RobolectricTestRunner.class)
public class QuickAddActivityTest {

    private static final long LIST_ID = 74L;

    private Context context;
    private RecordingTransport transport;
    private int widgetId;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        widgetId = shadowOf(AppWidgetManager.getInstance(context))
            .createWidget(EveryListWidget.class, R.layout.widget_everylist);
        context.getSharedPreferences(WidgetPrefs.GLOBAL_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("widget_" + widgetId, Context.MODE_PRIVATE).edit().clear().commit();

        transport = new RecordingTransport();
        transport.respondWith("{\"data\":{\"id\":11}}");
        HttpJson.setTransportForTesting(transport);

        WidgetPrefs.saveGlobalCredentials(context, "elt", 7L, "http://server", Collections.singletonList(LIST_ID));
        WidgetPrefs prefs = new WidgetPrefs(context, widgetId);
        prefs.setListId(LIST_ID);
        prefs.setListName("TODO");
    }

    @After
    public void tearDown() {
        EveryListWidget.awaitIdleForTesting();
        HttpJson.resetTransportForTesting();
    }

    private Intent intent(int id) {
        return new Intent(context, QuickAddActivity.class)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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

    /** Waits until the popup has finished itself after a successful save. `save()` runs the POST,
     *  then the widget refresh, then posts `finish()`, so `isFinishing()` becoming true means the
     *  whole save completed — unlike "a request was recorded", which the transport does before it
     *  returns. Robolectric never advances the scenario to DESTROYED on `finish()`, so poll the
     *  Activity's own flag (guarding the destroy case, where onActivity throws). */
    private void awaitFinished(ActivityScenario<QuickAddActivity> scenario) {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle();
            final boolean[] finished = {false};
            try {
                scenario.onActivity(a -> finished[0] = a.isFinishing());
            } catch (IllegalStateException alreadyDestroyed) {
                return;
            }
            if (finished[0]) return;
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        }
        throw new AssertionError("popup did not finish after a successful save");
    }

    @Test
    public void finishesImmediatelyWhenProvisioningIsInvalid() {
        // onCreate calls finish() before any of the popup's wiring, so the scenario is already
        // destroyed by the time launch() returns (calling onActivity would NPE). Assert on the
        // observable side effect instead: no popup work, no request.
        ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(AppWidgetManager.INVALID_APPWIDGET_ID));
        scenario.close();
        EveryListWidget.awaitIdleForTesting();
        assertTrue(transport.calls().isEmpty());
    }

    @Test
    public void hidesDeadlineControlsWhenTheListHasDeadlinesOff() {
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                assertEquals(View.GONE, a.findViewById(R.id.quick_add_deadline).getVisibility());
                assertEquals(View.GONE, a.findViewById(R.id.quick_add_deadline_preview).getVisibility());
            });
        }
    }

    @Test
    public void showsTheClockPlaceholderWhenDeadlinesAreOn() {
        new WidgetPrefs(context, widgetId).setUseDeadline(true);
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                assertEquals(View.VISIBLE, a.findViewById(R.id.quick_add_deadline).getVisibility());
                TextView preview = a.findViewById(R.id.quick_add_deadline_preview);
                assertEquals(View.VISIBLE, preview.getVisibility());
                assertEquals(a.getString(R.string.quick_add_deadline), preview.getText().toString());
            });
        }
    }

    @Test
    public void anEmptyNameFinishesWithoutAnyRequest() {
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> a.findViewById(R.id.quick_add_save).performClick());
            EveryListWidget.awaitIdleForTesting();
            assertTrue("a blank quick-add must not call the API", transport.calls().isEmpty());
        }
    }

    @Test
    public void savePostsTheItemAndRefreshesTheWidget() {
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                ((android.widget.EditText) a.findViewById(R.id.quick_add_input)).setText("Milk");
                a.findViewById(R.id.quick_add_save).performClick();
            });
            awaitFinished(scenario);
            // The POST is the first request; the widget refresh that follows is a GET.
            assertEquals("POST", transport.get(0).method);
            assertEquals("http://server/api/v1/lists/74/items", transport.get(0).url);
        }
    }

    @Test
    public void aNameOnlyAddOmitsTheDeadlineField() throws Exception {
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                ((android.widget.EditText) a.findViewById(R.id.quick_add_input)).setText("Milk");
                a.findViewById(R.id.quick_add_save).performClick();
            });
            awaitFinished(scenario);
            // No widget is placed, so the refresh is a no-op; the create is the only request.
            JSONObject sent = new JSONObject(transport.get(0).body);
            assertEquals("Milk", sent.getString("name"));
            assertTrue(!sent.has("deadline"));
        }
    }

    @Test
    public void aFailedAddShowsTheErrorAndReenablesSave() {
        transport.failAlways(new IOException("API returned 500"));
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                ((android.widget.EditText) a.findViewById(R.id.quick_add_input)).setText("Milk");
                a.findViewById(R.id.quick_add_save).performClick();
            });
            // Wait for the background failure to reach the main thread (the error is posted via
            // the Activity's main handler, so idle the looper each poll).
            long deadline = System.currentTimeMillis() + 5000;
            boolean shown = false;
            while (System.currentTimeMillis() < deadline && !shown) {
                shadowOf(Looper.getMainLooper()).idle();
                final boolean[] visible = {false};
                scenario.onActivity(a ->
                    visible[0] = a.findViewById(R.id.quick_add_error).getVisibility() == View.VISIBLE);
                shown = visible[0];
                if (!shown) {
                    try {
                        Thread.sleep(10);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
            }
            assertTrue("the error should be shown after a failed add", shown);
            scenario.onActivity(a -> assertTrue(a.findViewById(R.id.quick_add_save).isEnabled()));
        }
    }

    @Test
    public void aDeadlinePickedOnANewItemRidesAlongWithTheCreate() throws Exception {
        new WidgetPrefs(context, widgetId).setUseDeadline(true);
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                try {
                    java.lang.reflect.Method setPicked =
                        QuickAddActivity.class.getDeclaredMethod("setPickedDeadline", String.class);
                    setPicked.setAccessible(true);
                    setPicked.invoke(a, "2026-09-30T10:00");
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
                ((android.widget.EditText) a.findViewById(R.id.quick_add_input)).setText("Milk");
                a.findViewById(R.id.quick_add_save).performClick();
            });
            awaitFinished(scenario);
            JSONObject sent = new JSONObject(transport.get(0).body);
            assertEquals("2026-09-30T10:00", sent.getString("deadline"));
        }
    }

    @Test
    public void fallsBackToTheDefaultTitleWhenTheListNameIsUnknown() {
        WidgetPrefs p = new WidgetPrefs(context, widgetId);
        p.setListName("");
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                TextView title = a.findViewById(R.id.quick_add_title);
                assertTrue(title.getText().toString()
                    .contains(a.getString(R.string.widget_default_title)));
            });
        }
    }

    @Test
    public void theImeDoneActionSavesTheItem() {
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                android.widget.EditText input = a.findViewById(R.id.quick_add_input);
                input.setText("Milk");
                input.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
            });
            awaitFinished(scenario);
            assertEquals("POST", transport.get(0).method);
        }
    }

    @Test
    public void restoringAPickedDeadlineSurvivesRecreation() {
        new WidgetPrefs(context, widgetId).setUseDeadline(true);
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                try {
                    java.lang.reflect.Method setPicked =
                        QuickAddActivity.class.getDeclaredMethod("setPickedDeadline", String.class);
                    setPicked.setAccessible(true);
                    setPicked.invoke(a, "2026-09-30T10:00");
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
            });
            scenario.recreate();
            scenario.onActivity(a -> {
                TextView preview = a.findViewById(R.id.quick_add_deadline_preview);
                assertTrue("a restored deadline should re-render its formatted label",
                    preview.getText().toString().contains("Sep 30"));
            });
        }
    }

    @Test
    public void theDeadlinePickerOpensAndCancellingRestoresTheCard() {
        new WidgetPrefs(context, widgetId).setUseDeadline(true);
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                a.findViewById(R.id.quick_add_deadline).performClick();
                View card = a.findViewById(R.id.quick_add_card);
                assertEquals("the picker should hide the card while shown",
                    View.INVISIBLE, card.getVisibility());

                android.app.Dialog dialog = org.robolectric.shadows.ShadowDialog.getLatestDialog();
                assertTrue("the clock should open a date picker", dialog instanceof android.app.DatePickerDialog);
                // Invoke the dialog's registered OnCancelListener directly — the app installs one
                // that restores the card, and that listener is the behaviour under test.
                android.content.DialogInterface.OnCancelListener onCancel =
                    org.robolectric.Shadows.shadowOf((android.app.Dialog) dialog).getOnCancelListener();
                assertTrue("the picker should register a cancel listener", onCancel != null);
                onCancel.onCancel(dialog);
                assertEquals("cancelling should restore the card",
                    View.VISIBLE, card.getVisibility());
            });
        }
    }

    @Test
    public void theNoTimeButtonAppliesADateOnlyDeadline() {
        new WidgetPrefs(context, widgetId).setUseDeadline(true);
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                try {
                    java.lang.reflect.Method timePicker =
                        QuickAddActivity.class.getDeclaredMethod("showTimePicker", int.class, int.class, int.class);
                    timePicker.setAccessible(true);
                    timePicker.invoke(a, 2026, 8, 30);
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
                android.app.Dialog dialog = org.robolectric.shadows.ShadowDialog.getLatestDialog();
                assertTrue(dialog instanceof android.app.TimePickerDialog);
                // AlertDialog routes a button click through a Handler message; idle the looper so
                // the installed "No time" listener actually runs.
                ((android.app.AlertDialog) dialog)
                    .getButton(android.content.DialogInterface.BUTTON_NEGATIVE).performClick();
                shadowOf(Looper.getMainLooper()).idle();
                TextView preview = a.findViewById(R.id.quick_add_deadline_preview);
                assertTrue("a date-only pick should render its date, was: " + preview.getText(),
                    preview.getText().toString().contains("Sep 30"));
            });
        }
    }

    @Test
    public void aDeadlineTheServerDidNotApplyIsPatchedAfterTheCreate() {
        // The create returns an item with no deadline (the get-or-create path), so the popup must
        // follow up with an explicit PATCH carrying the picked deadline.
        new WidgetPrefs(context, widgetId).setUseDeadline(true);
        transport.respondWith("{\"data\":{\"id\":11,\"deadline\":null}}");
        try (ActivityScenario<QuickAddActivity> scenario = ActivityScenario.launch(intent(widgetId))) {
            scenario.onActivity(a -> {
                try {
                    java.lang.reflect.Method setPicked =
                        QuickAddActivity.class.getDeclaredMethod("setPickedDeadline", String.class);
                    setPicked.setAccessible(true);
                    setPicked.invoke(a, "2026-09-30T10:00");
                } catch (Exception e) {
                    throw new AssertionError(e);
                }
                ((android.widget.EditText) a.findViewById(R.id.quick_add_input)).setText("Milk");
                a.findViewById(R.id.quick_add_save).performClick();
            });
            awaitFinished(scenario);
            assertEquals("POST", transport.get(0).method);
            assertEquals("PATCH", transport.get(1).method);
            assertEquals("http://server/api/v1/lists/74/items/11", transport.get(1).url);
        }
    }
}
