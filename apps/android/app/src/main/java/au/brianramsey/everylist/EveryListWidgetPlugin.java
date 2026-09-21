package au.brianramsey.everylist;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/** The app→widget handoff channel (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). The web app mints a list-scoped PAT and
 *  calls {@code EveryListWidget.configure(...)}; this writes the credentials into the widget's
 *  SharedPreferences and opens the config screen — keeping the token out of any loggable URI (the
 *  earlier design carried it in an {@code everylist://widget-config} deep-link query string, which
 *  Android can surface in {@code dumpsys}/logcat). The token lives only in private app storage. */
@CapacitorPlugin(name = "EveryListWidget")
public class EveryListWidgetPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        String token = call.getString("token");
        String serverUrl = call.getString("serverUrl");
        List<Long> listIds = parseListIds(call);
        if (token == null || token.isEmpty() || serverUrl == null || serverUrl.isEmpty() || listIds.isEmpty()) {
            call.reject("token, serverUrl and a non-empty listIds array are required");
            return;
        }

        WidgetPrefs.saveGlobalCredentials(getContext(), token, serverUrl, listIds);

        // Bring up the config screen so the user picks which list the widget shows and the
        // show/hide-completed default. Uses the app context, hence NEW_TASK.
        Intent intent = new Intent(getContext(), WidgetConfigActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        call.resolve();
    }

    /** Re-renders every placed widget from the server. The web app calls this (debounced) after it
     *  changes anything, so the widgets don't sit stale until their next manual refresh or the
     *  system's ~30-minute tick. Sends the same broadcast the widget's own refresh button does, so
     *  the fetch runs through {@link WidgetUpdater} off the main thread like any other refresh. */
    @PluginMethod
    public void refresh(PluginCall call) {
        Context context = getContext();
        int[] ids = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(new ComponentName(context, EveryListWidget.class));
        for (int appWidgetId : ids) {
            context.sendBroadcast(new Intent(context, EveryListWidget.class)
                .setAction(EveryListWidget.ACTION_REFRESH)
                .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, appWidgetId));
        }
        call.resolve();
    }

    private static List<Long> parseListIds(PluginCall call) {
        List<Long> ids = new ArrayList<>();
        try {
            for (Object o : call.getArray("listIds", new com.getcapacitor.JSArray()).toList()) {
                if (o instanceof Number) {
                    ids.add(((Number) o).longValue());
                } else if (o instanceof String && !((String) o).isEmpty()) {
                    ids.add(Long.parseLong(((String) o).trim()));
                }
            }
        } catch (Exception e) {
            return ids; // malformed payload — caller rejects on the empty check
        }
        return ids;
    }
}