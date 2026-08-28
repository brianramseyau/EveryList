package au.brianramsey.everylist;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The EveryList home-screen widget (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). Rendering, fetching, and toggling all run
 *  in {@link WidgetUpdater} off the main thread; this provider stays thin — it dispatches
 *  the widget's broadcasts (refresh, show/hide-done, item taps) and launches the app for
 *  open-item and quick-add actions. */
public class EveryListWidget extends AppWidgetProvider {

    static final String ACTION_REFRESH = "au.brianramsey.everylist.widget.REFRESH";
    static final String ACTION_TOGGLE_COMPLETED = "au.brianramsey.everylist.widget.TOGGLE_COMPLETED";
    /** The ListView's shared click template; per-row fill-ins decide open vs toggle. */
    static final String ACTION_ITEM = "au.brianramsey.everylist.widget.ITEM";

    static final String EXTRA_APPWIDGET_ID = "appWidgetId";
    static final String EXTRA_ACTION = "widgetAction";
    static final String EXTRA_ITEM_ID = "itemId";
    static final String EXTRA_LIST_ID = "listId";

    static final String ACTION_OPEN_ITEM = "open";
    static final String ACTION_TOGGLE_ITEM = "toggle";

    /** The custom-scheme deep-link hosts the app responds to — must match the web app's
     *  `appUrlOpen` handler (apps/web/src/routes/+layout.svelte). */
    static final String DEEP_LINK_SCHEME = "everylist";
    static final String DEEP_LINK_HOST_LISTS = "lists";

    /** Shared across broadcasts so overlapping updates queue up rather than each spawning a thread. */
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // Called from within onReceive's dispatch, so goAsync() below is still valid here.
        final int[] ids = appWidgetIds.clone();
        runAsync(context, (ctx) -> {
            for (int appWidgetId : ids) {
                WidgetUpdater.handle(ctx, ACTION_REFRESH, appWidgetId, -1L, -1L);
            }
        });
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        int appWidgetId = intent.getIntExtra(EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (ACTION_REFRESH.equals(action) || ACTION_TOGGLE_COMPLETED.equals(action)) {
            runAsync(context, (ctx) -> WidgetUpdater.handle(ctx, action, appWidgetId, -1L, -1L));
            return;
        }
        if (ACTION_ITEM.equals(action)) {
            String itemAction = intent.getStringExtra(EXTRA_ACTION);
            long listId = intent.getLongExtra(EXTRA_LIST_ID, -1L);
            long itemId = intent.getLongExtra(EXTRA_ITEM_ID, -1L);
            if (ACTION_OPEN_ITEM.equals(itemAction) && listId > 0 && itemId > 0) {
                // Open the item editor in the app via deep link.
                Intent open = new Intent(Intent.ACTION_VIEW,
                    Uri.parse(DEEP_LINK_SCHEME + "://" + DEEP_LINK_HOST_LISTS + "/" + listId + "/items/" + itemId));
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(open);
            } else if (ACTION_TOGGLE_ITEM.equals(itemAction)
                    && appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID
                    && listId > 0 && itemId > 0) {
                runAsync(context, (ctx) -> WidgetUpdater.handle(ctx, ACTION_ITEM, appWidgetId, listId, itemId));
            }
            return;
        }
        super.onReceive(context, intent);
    }

    /** Keeps this broadcast alive while {@code work} runs off the main thread. See
     *  {@link WidgetUpdater}'s doc comment for why the work runs here rather than in a started
     *  Service or a WorkManager job — both had side effects that broke the widget outright. */
    private void runAsync(Context context, WidgetWork work) {
        // The receiver's own Context is restricted and shouldn't outlive onReceive.
        final Context appContext = context.getApplicationContext();
        final PendingResult pending = goAsync();
        EXECUTOR.execute(() -> {
            try {
                work.run(appContext);
            } finally {
                pending.finish();
            }
        });
    }

    private interface WidgetWork {
        void run(Context context);
    }
}