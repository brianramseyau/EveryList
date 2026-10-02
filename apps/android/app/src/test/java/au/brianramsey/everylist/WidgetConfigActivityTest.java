package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;
import android.view.View;
import android.widget.RadioButton;
import android.widget.RadioGroup;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.IOException;
import java.util.function.BooleanSupplier;

/**
 * Unit tests for {@link WidgetConfigActivity} — the three entry paths (placement, app handoff,
 * quick switch) and the granted-list filtering. Runs the real Activity under Robolectric with the
 * API driven through the {@link HttpJson} transport seam.
 */
@RunWith(RobolectricTestRunner.class)
public class WidgetConfigActivityTest {

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
        transport.respondWith("{\"data\":[{\"id\":74,\"name\":\"TODO\"},{\"id\":3,\"name\":\"Hardware\"}]}");
        HttpJson.setTransportForTesting(transport);
    }

    @After
    public void tearDown() {
        EveryListWidget.awaitIdleForTesting();
        HttpJson.resetTransportForTesting();
    }

    private void provision(long... grantedIds) {
        java.util.List<Long> ids = new java.util.ArrayList<>();
        for (long id : grantedIds) ids.add(id);
        WidgetPrefs.saveGlobalCredentials(context, "elt", 7L, "http://server", ids);
    }

    private Intent placementIntent(int id) {
        return new Intent(context, WidgetConfigActivity.class)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    private Intent quickSwitchIntent(int id) {
        return new Intent(context, WidgetConfigActivity.class)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** Waits until the config screen's fetch has actually completed — the list group populated, or
     *  an error shown — rather than merely until a request was recorded (the transport records
     *  before it returns, so a recorded call does not mean the main-thread callback has run). */
    private void awaitListsLoaded(ActivityScenario<WidgetConfigActivity> scenario) {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle();
            final boolean[] done = {false};
            scenario.onActivity(a -> done[0] =
                ((RadioGroup) a.findViewById(R.id.config_list_group)).getChildCount() > 0
                    || a.findViewById(R.id.config_error).getVisibility() == View.VISIBLE);
            if (done[0]) return;
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new AssertionError(e);
            }
        }
        throw new AssertionError("lists never loaded (no list rows and no error)");
    }

    private RadioButton radioLabelled(WidgetConfigActivity activity, String label) {
        RadioGroup group = activity.findViewById(R.id.config_list_group);
        for (int i = 0; i < group.getChildCount(); i++) {
            View child = group.getChildAt(i);
            if (child instanceof RadioButton && label.contentEquals(((RadioButton) child).getText())) {
                return (RadioButton) child;
            }
        }
        return null;
    }

    @Test
    public void withoutCredentialsShowsTheSetUpPrompt() {
        try (ActivityScenario<WidgetConfigActivity> scenario =
                 ActivityScenario.launch(placementIntent(AppWidgetManager.INVALID_APPWIDGET_ID))) {
            scenario.onActivity(a -> {
                assertEquals(View.VISIBLE, a.findViewById(R.id.config_error).getVisibility());
                assertEquals(View.VISIBLE, a.findViewById(R.id.config_open_app).getVisibility());
                assertEquals(View.GONE, a.findViewById(R.id.config_list_group).getVisibility());
            });
        }
    }

    @Test
    public void setupPromptOpensTheAppDeepLink() {
        try (ActivityScenario<WidgetConfigActivity> scenario =
                 ActivityScenario.launch(placementIntent(AppWidgetManager.INVALID_APPWIDGET_ID))) {
            scenario.onActivity(a -> a.findViewById(R.id.config_open_app).performClick());
            Intent launched = shadowOf((android.app.Application) context).getNextStartedActivity();
            assertNotNull(launched);
            assertEquals(Uri.parse("everylist://settings/widget"), launched.getData());
        }
    }

    @Test
    public void placementShowsOnlyGrantedLists() {
        provision(74L); // only TODO is granted; Hardware must be filtered out.
        try (ActivityScenario<WidgetConfigActivity> scenario = ActivityScenario.launch(placementIntent(widgetId))) {
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                RadioGroup group = a.findViewById(R.id.config_list_group);
                int radios = 0;
                for (int i = 0; i < group.getChildCount(); i++) {
                    if (group.getChildAt(i) instanceof RadioButton) radios++;
                }
                assertEquals(1, radios);
                assertEquals("TODO", ((RadioButton) group.getChildAt(0)).getText().toString());
            });
        }
    }

    @Test
    public void placementSaveStoresTheChoiceAndSetsResultOk() {
        provision(74L, 3L);
        try (ActivityScenario<WidgetConfigActivity> scenario = ActivityScenario.launch(placementIntent(widgetId))) {
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                radioLabelled(a, "Hardware").setChecked(true);
                a.findViewById(R.id.config_save).performClick();
            });
            assertEquals(3L, new WidgetPrefs(context, widgetId).getListId());
        }
    }

    @Test
    public void savingWithoutPickingAListShowsAnError() {
        provision(74L, 3L);
        try (ActivityScenario<WidgetConfigActivity> scenario = ActivityScenario.launch(placementIntent(widgetId))) {
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                ((RadioGroup) a.findViewById(R.id.config_list_group)).clearCheck();
                a.findViewById(R.id.config_save).performClick();
                assertEquals(View.VISIBLE, a.findViewById(R.id.config_error).getVisibility());
            });
        }
    }

    @Test
    public void quickSwitchHidesSaveAndAppliesOnTap() {
        provision(74L, 3L);
        try (ActivityScenario<WidgetConfigActivity> scenario = ActivityScenario.launch(quickSwitchIntent(widgetId))) {
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                assertEquals(View.GONE, a.findViewById(R.id.config_save).getVisibility());
                assertEquals(View.GONE, a.findViewById(R.id.config_show_completed).getVisibility());
                radioLabelled(a, "Hardware").performClick();
            });
            assertEquals(3L, new WidgetPrefs(context, widgetId).getListId());
        }
    }

    @Test
    public void appHandoffWithNoWidgetIdStoresGlobalDefaults() {
        provision(74L, 3L);
        try (ActivityScenario<WidgetConfigActivity> scenario =
                 ActivityScenario.launch(new Intent(context, WidgetConfigActivity.class)
                     .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))) {
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                radioLabelled(a, "Hardware").setChecked(true);
                a.findViewById(R.id.config_save).performClick();
            });
            assertEquals(3L, WidgetPrefs.getGlobalDefaultListId(context));
        }
    }

    @Test
    public void aFailedFetchShowsTheLoadError() {
        provision(74L);
        transport.failAlways(new IOException("API returned 500"));
        try (ActivityScenario<WidgetConfigActivity> scenario = ActivityScenario.launch(placementIntent(widgetId))) {
            // Wait for the error state itself, not the recorded request — the transport records
            // before throwing, so the main-thread error callback may not have run yet.
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                assertEquals(View.GONE, a.findViewById(R.id.config_list_hint).getVisibility());
                assertEquals(View.VISIBLE, a.findViewById(R.id.config_error).getVisibility());
            });
        }
    }

    @Test
    public void anEmptyGrantIntersectionShowsTheNoListsError() {
        // Provisioned with a list the server doesn't return (e.g. it was deleted): the picker is
        // empty, so the screen must say so rather than sit on the loading hint.
        provision(999L);
        try (ActivityScenario<WidgetConfigActivity> scenario = ActivityScenario.launch(placementIntent(widgetId))) {
            awaitListsLoaded(scenario);
            scenario.onActivity(a -> {
                assertEquals(View.VISIBLE, a.findViewById(R.id.config_error).getVisibility());
                assertEquals(View.GONE, a.findViewById(R.id.config_list_hint).getVisibility());
            });
        }
    }
}
