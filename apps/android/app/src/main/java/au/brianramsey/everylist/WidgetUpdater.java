package au.brianramsey.everylist;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationManagerCompat;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** Does all of the widget's work off the main thread: fetching the selected list's items,
 *  toggling a checkbox, flipping show/hide-completed, and rendering the RemoteViews (header +
 *  scrollable ListView).
 *
 *  <p>Callers run {@link #handle} on a background thread themselves — {@link EveryListWidget} via
 *  {@code BroadcastReceiver#goAsync()}, {@link WidgetConfigActivity} via a plain thread. Two earlier
 *  approaches both had to be abandoned (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md):
 *
 *  <ul>
 *    <li>A started {@code Service}: {@link EveryListWidget}'s onUpdate/onReceive have no foreground
 *        presence to justify {@code Context#startService()} with, so once the app had sat
 *        backgrounded a while Android threw {@code BackgroundServiceStartNotAllowedException},
 *        crashing the receiver and leaving the widget stuck on its loading placeholder forever.</li>
 *    <li>{@code WorkManager}: enqueueing work flips the enabled state of WorkManager's own
 *        {@code RescheduleReceiver} component, which emits {@code ACTION_PACKAGE_CHANGED} for this
 *        package. The launcher reacts to that by re-broadcasting {@code APPWIDGET_UPDATE} to our
 *        widget, which enqueues again — a self-sustaining loop that re-rendered the widget about
 *        once a second indefinitely (reproduced on a stock Android 16 device).</li>
 *  </ul>
 *
 *  <p>{@code goAsync()} avoids both: no service start, and no package-visible side effects. */
public class WidgetUpdater {

    private WidgetUpdater() {}

    /** Fetch-failure backoff: doubles from {@link #RETRY_BASE_DELAY_MS} up to {@link
     *  #RETRY_MAX_ATTEMPTS} attempts, capped at {@link #RETRY_MAX_DELAY_MS}, then gives up until
     *  the user manually refreshes or the system's own {@code updatePeriodMillis} tick fires
     *  (see everylist_widget_info.xml). Scheduled with {@code AlarmManager} rather than
     *  WorkManager or a started Service — both were tried and abandoned for this widget (see this
     *  class's doc comment) — using {@code setAndAllowWhileIdle} so it still fires under Doze
     *  without needing the SCHEDULE_EXACT_ALARM permission. */
    private static final int RETRY_MAX_ATTEMPTS = 6;
    private static final long RETRY_BASE_DELAY_MS = 30_000L;
    private static final long RETRY_MAX_DELAY_MS = 16 * 60 * 1000L;

    /** Runs one refresh/toggle cycle. Blocking — must be called off the main thread. */
    static void handle(Context context, String action, int appWidgetId, long toggleListId, long toggleItemId) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        WidgetPrefs prefs = new WidgetPrefs(context, appWidgetId);

        if (!prefs.hasCredentials()) {
            renderSetUp(context, manager, appWidgetId);
            return;
        }

        if (EveryListWidget.ACTION_TOGGLE_COMPLETED.equals(action)) {
            prefs.setShowCompleted(!prefs.getShowCompleted());
        }

        String token = prefs.getToken();
        String serverUrl = prefs.getServerUrl();
        prefs.seedFromDefaults(context);
        long listId = prefs.getListId();

        boolean failed = false;
        List<WidgetModels.WidgetItem> preToggleSnapshot = null;
        try {
            if (EveryListWidget.ACTION_ITEM.equals(action) && toggleItemId > 0 && toggleListId > 0) {
                preToggleSnapshot = prefs.loadSnapshot();
                boolean nowChecked = !isChecked(preToggleSnapshot, toggleItemId);

                // Apply the toggle to the row locally and render right away — on a slow or flaky
                // connection (e.g. cellular) the PATCH below can take seconds, and the tap should
                // never look inert while it's in flight. Reconciled with the real state once the
                // network calls below return.
                prefs.saveSnapshot(applyOptimisticToggle(preToggleSnapshot, toggleItemId, nowChecked, prefs.getShowCompleted()));
                render(context, manager, appWidgetId, prefs, false);

                WidgetApiClient.toggleItem(token, serverUrl, toggleListId, toggleItemId, nowChecked);

                // Checking it off here bypasses the app/JS entirely, so nothing else cancels this
                // item's own deadline notification (native.ts schedules it with the item's id as
                // the notification id — see syncNativeDeadlineNotifications). Without this it would
                // sit there until the next periodic resync.
                if (nowChecked) NotificationManagerCompat.from(context).cancel((int) toggleItemId);
            }
            // One round trip for everything we render: list name (for the header) and the rows,
            // already filtered (show/hide-completed) and ordered server-side.
            WidgetModels.WidgetSnapshot snapshot =
                WidgetApiClient.fetchWidgetSnapshot(token, serverUrl, listId, prefs.getShowCompleted());
            prefs.setListName(snapshot.listName);
            prefs.setUseDeadline(snapshot.useDeadline);
            prefs.saveSnapshot(snapshot.items);
            prefs.setLastError(null);
            prefs.setRetryCount(0);
            cancelPendingRetry(context, appWidgetId);
        } catch (IOException e) {
            // The toggle (or the refetch confirming it) didn't make it to the server — put the row
            // back as it was rather than leave it looking applied when it isn't.
            if (preToggleSnapshot != null) prefs.saveSnapshot(preToggleSnapshot);
            // Stay quiet through the retry backoff — a blip shouldn't flash an error over a still-good
            // snapshot. Only surface it once retries are exhausted, per RETRY_MAX_ATTEMPTS.
            if (scheduleRetry(context, prefs, appWidgetId)) {
                prefs.setLastError(context.getString(R.string.widget_offline_note));
                failed = true;
            }
        }

        render(context, manager, appWidgetId, prefs, failed);
    }

    private static boolean isChecked(List<WidgetModels.WidgetItem> snapshot, long itemId) {
        for (WidgetModels.WidgetItem it : snapshot) {
            if (it.id == itemId) return it.checked;
        }
        return false;
    }

    /** Mirrors the server's own filtering (see {@link WidgetModels.WidgetItem}'s doc comment) so the
     *  optimistic render matches what the follow-up fetch would show on success: the toggled row is
     *  dropped when it would no longer pass the show/hide-completed filter, otherwise just re-flagged. */
    private static List<WidgetModels.WidgetItem> applyOptimisticToggle(
            List<WidgetModels.WidgetItem> snapshot, long itemId, boolean nowChecked, boolean showCompleted) {
        List<WidgetModels.WidgetItem> updated = new ArrayList<>(snapshot.size());
        for (WidgetModels.WidgetItem it : snapshot) {
            if (it.id != itemId) {
                updated.add(it);
                continue;
            }
            if (nowChecked && !showCompleted) continue; // checked off, and hidden — drop the row
            updated.add(new WidgetModels.WidgetItem(it.id, it.name, nowChecked, it.quantity, it.deadline));
        }
        return updated;
    }

    private static void render(Context context, AppWidgetManager manager, int appWidgetId,
                        WidgetPrefs prefs, boolean failed) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_everylist);

        String listName = prefs.getListName();
        if (listName.isEmpty()) listName = context.getString(R.string.widget_default_title);
        rv.setTextViewText(R.id.widget_list_button, listName + " \u25BE");
        rv.setTextViewText(R.id.widget_toggle_completed,
            prefs.getShowCompleted() ? context.getString(R.string.widget_hide_done) : context.getString(R.string.widget_show_done));

        boolean showError = failed || prefs.getLastError() != null;
        rv.setViewVisibility(R.id.widget_error, showError ? View.VISIBLE : View.GONE);

        rv.setOnClickPendingIntent(R.id.widget_list_button, pendingActivity(context, appWidgetId,
            new Intent(context, WidgetConfigActivity.class)
                .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId)));
        rv.setOnClickPendingIntent(R.id.widget_toggle_completed, pendingBroadcast(context, appWidgetId,
            new Intent(context, EveryListWidget.class).setAction(EveryListWidget.ACTION_TOGGLE_COMPLETED)
                .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId)));
        rv.setOnClickPendingIntent(R.id.widget_refresh, pendingBroadcast(context, appWidgetId,
            new Intent(context, EveryListWidget.class).setAction(EveryListWidget.ACTION_REFRESH)
                .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId)));

        long listId = prefs.getListId();
        if (listId > 0) {
            rv.setOnClickPendingIntent(R.id.widget_add, pendingActivity(context, appWidgetId,
                new Intent(context, QuickAddActivity.class)
                    .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId)));
            rv.setViewVisibility(R.id.widget_add, View.VISIBLE);
        } else {
            rv.setViewVisibility(R.id.widget_add, View.GONE);
        }

        rv.setRemoteAdapter(R.id.widget_list, adapterIntent(context, appWidgetId));
        rv.setEmptyView(R.id.widget_list, R.id.widget_empty);

        Intent template = new Intent(context, EveryListWidget.class).setAction(EveryListWidget.ACTION_ITEM);
        template.putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId);
        // Must be mutable: the system fills in each row's setOnClickFillInIntent extras (item id,
        // open vs toggle) into this PendingIntent's Intent at click time, which an immutable
        // PendingIntent can't be modified to do — rows would render but every tap would silently
        // no-op with no crash and no log line, exactly as observed on-device.
        rv.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getBroadcast(context, appWidgetId, template,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));

        manager.updateAppWidget(appWidgetId, rv);
        manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list);
    }

    /** Renders the not-yet-provisioned state: a note + a button that opens the app's widget setup. */
    private static void renderSetUp(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_everylist);
        rv.setTextViewText(R.id.widget_list_button, context.getString(R.string.widget_default_title));
        rv.setTextViewText(R.id.widget_error, context.getString(R.string.widget_setup_note));
        rv.setViewVisibility(R.id.widget_error, View.VISIBLE);
        rv.setViewVisibility(R.id.widget_toggle_completed, View.GONE);
        rv.setViewVisibility(R.id.widget_refresh, View.GONE);
        rv.setViewVisibility(R.id.widget_add, View.GONE);
        // No empty view set, so the empty ListView just stays blank. Deliberately no appWidgetId
        // extra (unlike adapterIntent): the factory then reads no instance snapshot, so the setup
        // state stays empty even if this widget once persisted rows. Its own URI scheme keeps its
        // factory distinct from this widget's normal one (adapterIntent) too, so a factory cached
        // with real rows can't be handed back here.
        rv.setRemoteAdapter(R.id.widget_list, new Intent(context, WidgetListService.class)
            .setData(Uri.fromParts("widget-setup", String.valueOf(appWidgetId), null)));

        rv.setOnClickPendingIntent(R.id.widget_list_button, pendingActivity(context, appWidgetId,
            new Intent(Intent.ACTION_VIEW,
                Uri.parse(EveryListWidget.DEEP_LINK_SCHEME + "://settings/widget"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
        rv.setOnClickPendingIntent(R.id.widget_refresh, pendingBroadcast(context, appWidgetId,
            new Intent(context, EveryListWidget.class).setAction(EveryListWidget.ACTION_REFRESH)
                .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId)));

        manager.updateAppWidget(appWidgetId, rv);
    }

    /** The RemoteViewsService intent for one widget. Android caches a service's factory by {@link
     *  Intent#filterEquals}, which ignores extras — so with only an appWidgetId extra, every widget
     *  instance shared the first one's factory and showed its list's rows. The per-widget data URI
     *  makes each instance's intent distinct. */
    private static Intent adapterIntent(Context context, int appWidgetId) {
        Intent adapter = new Intent(context, WidgetListService.class);
        adapter.putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId);
        adapter.setData(Uri.fromParts("widget", String.valueOf(appWidgetId), null));
        return adapter;
    }

    /** Records the failed attempt and, while under {@link #RETRY_MAX_ATTEMPTS}, arms an alarm to
     *  re-run {@link EveryListWidget#ACTION_REFRESH} after an exponentially growing delay.
     *
     *  @return true once the backoff is exhausted (attempts used up, no further alarm armed) —
     *      the caller's cue that this failure is no longer transient and should be shown. */
    private static boolean scheduleRetry(Context context, WidgetPrefs prefs, int appWidgetId) {
        int attempt = prefs.getRetryCount() + 1;
        prefs.setRetryCount(attempt);
        if (attempt > RETRY_MAX_ATTEMPTS) return true;

        long delayMs = Math.min(RETRY_BASE_DELAY_MS << (attempt - 1), RETRY_MAX_DELAY_MS);
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager == null) return true;
        alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + delayMs, retryPendingIntent(context, appWidgetId));
        return false;
    }

    static void cancelPendingRetry(Context context, int appWidgetId) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager != null) alarmManager.cancel(retryPendingIntent(context, appWidgetId));
    }

    /** Same request code and action as the widget's own refresh-button broadcast (built in
     *  {@link #render}), so this doesn't need bookkeeping of its own — arming or cancelling it
     *  just re-targets that one PendingIntent. */
    private static PendingIntent retryPendingIntent(Context context, int appWidgetId) {
        return pendingBroadcast(context, appWidgetId, new Intent(context, EveryListWidget.class)
            .setAction(EveryListWidget.ACTION_REFRESH)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId));
    }

    private static PendingIntent pendingBroadcast(Context context, int appWidgetId, Intent intent) {
        return PendingIntent.getBroadcast(context, appWidgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent pendingActivity(Context context, int appWidgetId, Intent intent) {
        return PendingIntent.getActivity(context, appWidgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
