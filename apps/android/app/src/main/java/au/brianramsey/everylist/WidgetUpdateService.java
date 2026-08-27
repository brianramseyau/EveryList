package au.brianramsey.everylist;

import android.app.PendingIntent;
import android.app.Service;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.IBinder;
import android.view.View;
import android.widget.RemoteViews;

import java.io.IOException;
import java.util.List;

/** Does all of the widget's work on a background thread: fetching the selected list's items,
 *  toggling a checkbox, flipping show/hide-completed, and rendering the RemoteViews (header +
 *  scrollable ListView). Started from {@link EveryListWidget} and from {@link WidgetConfigActivity}
 *  after a config save. */
public class WidgetUpdateService extends Service {

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        final int appWidgetId = intent.getIntExtra(
            EveryListWidget.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        final String action = intent.getAction();
        final long listId = intent.getLongExtra(EveryListWidget.EXTRA_LIST_ID, -1L);
        final long itemId = intent.getLongExtra(EveryListWidget.EXTRA_ITEM_ID, -1L);

        // Network + render on a worker thread so the main thread never blocks.
        final int thisStartId = startId;
        new Thread(() -> {
            try {
                handle(appWidgetId, action, listId, itemId);
            } finally {
                stopSelf(thisStartId);
            }
        }).start();
        return START_NOT_STICKY;
    }

    private void handle(int appWidgetId, String action, long toggleListId, long toggleItemId) {
        Context context = getApplicationContext();
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        WidgetPrefs prefs = new WidgetPrefs(context, appWidgetId);

        if (!prefs.hasCredentials()) {
            renderSetUp(context, manager, appWidgetId, prefs);
            return;
        }

        String token = prefs.getToken();
        String serverUrl = prefs.getServerUrl();
        prefs.seedFromDefaults(context);
        long listId = prefs.getListId();
        boolean showCompleted = prefs.getShowCompleted();

        boolean failed = false;
        try {
            if (EveryListWidget.ACTION_ITEM.equals(action) && toggleItemId > 0 && toggleListId > 0) {
                // Optimistic flip from the last-known state, then reconcile with a refetch.
                boolean nowChecked = !isChecked(prefs.loadSnapshot(), toggleItemId);
                WidgetApiClient.toggleItem(token, serverUrl, toggleListId, toggleItemId, nowChecked);
            }
            // Re-fetch everything we render: list names (for the header) and the rows.
            List<WidgetModels.WidgetList> lists = WidgetApiClient.fetchLists(token, serverUrl);
            WidgetModels.WidgetList selected = findList(lists, listId);
            if (selected != null) prefs.setListName(selected.name);

            List<WidgetModels.WidgetItem> all = WidgetApiClient.fetchItems(token, serverUrl, listId);
            prefs.saveSnapshot(WidgetData.filter(all, true)); // store all non-deleted; factory filters
            prefs.setLastError(null);
        } catch (IOException e) {
            prefs.setLastError(getString(R.string.widget_offline_note));
            failed = true;
        }

        render(context, manager, appWidgetId, prefs, failed);
    }

    private static boolean isChecked(List<WidgetModels.WidgetItem> snapshot, long itemId) {
        for (WidgetModels.WidgetItem it : snapshot) {
            if (it.id == itemId) return it.checked;
        }
        return false;
    }

    private static WidgetModels.WidgetList findList(List<WidgetModels.WidgetList> lists, long listId) {
        for (WidgetModels.WidgetList l : lists) {
            if (l.id == listId) return l;
        }
        return null;
    }

    private void render(Context context, AppWidgetManager manager, int appWidgetId,
                        WidgetPrefs prefs, boolean failed) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_everylist);

        String listName = prefs.getListName();
        if (listName.isEmpty()) listName = context.getString(R.string.widget_default_title);
        rv.setTextViewText(R.id.widget_list_button, listName + " \u25BE");
        rv.setTextViewText(R.id.widget_toggle_completed,
            prefs.getShowCompleted() ? getString(R.string.widget_hide_done) : getString(R.string.widget_show_done));

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
                new Intent(Intent.ACTION_VIEW,
                    Uri.parse(EveryListWidget.DEEP_LINK_SCHEME + "://"
                        + EveryListWidget.DEEP_LINK_HOST_LISTS + "/" + listId))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
            rv.setViewVisibility(R.id.widget_add, View.VISIBLE);
        } else {
            rv.setViewVisibility(R.id.widget_add, View.GONE);
        }

        Intent adapter = new Intent(context, WidgetListService.class);
        adapter.putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId);
        rv.setRemoteAdapter(R.id.widget_list, adapter);
        rv.setEmptyView(R.id.widget_list, R.id.widget_empty);

        Intent template = new Intent(context, EveryListWidget.class).setAction(EveryListWidget.ACTION_ITEM);
        template.putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId);
        rv.setPendingIntentTemplate(R.id.widget_list, pendingBroadcast(context, appWidgetId, template));

        manager.updateAppWidget(appWidgetId, rv);
        manager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list);
    }

    /** Renders the not-yet-provisioned state: a note + a button that opens the app's widget setup. */
    private void renderSetUp(Context context, AppWidgetManager manager, int appWidgetId, WidgetPrefs prefs) {
        RemoteViews rv = new RemoteViews(context.getPackageName(), R.layout.widget_everylist);
        rv.setTextViewText(R.id.widget_list_button, context.getString(R.string.widget_default_title));
        rv.setTextViewText(R.id.widget_error, context.getString(R.string.widget_setup_note));
        rv.setViewVisibility(R.id.widget_error, View.VISIBLE);
        rv.setViewVisibility(R.id.widget_toggle_completed, View.GONE);
        rv.setViewVisibility(R.id.widget_refresh, View.GONE);
        rv.setViewVisibility(R.id.widget_add, View.GONE);
        // No empty view set, so the empty ListView just stays blank.
        rv.setRemoteAdapter(R.id.widget_list, new Intent(context, WidgetListService.class));

        rv.setOnClickPendingIntent(R.id.widget_list_button, pendingActivity(context, appWidgetId,
            new Intent(Intent.ACTION_VIEW,
                Uri.parse(EveryListWidget.DEEP_LINK_SCHEME + "://settings/widget"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
        rv.setOnClickPendingIntent(R.id.widget_refresh, pendingBroadcast(context, appWidgetId,
            new Intent(context, EveryListWidget.class).setAction(EveryListWidget.ACTION_REFRESH)
                .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId)));

        manager.updateAppWidget(appWidgetId, rv);
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