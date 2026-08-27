package au.brianramsey.everylist;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/** SharedPreferences access for the widget (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). Two layers:
 *  <ul>
 *    <li><b>Global</b> (`everylist_widget`): the provisioned credentials — PAT, server URL, and
 *        the granted list ids — written once from the app's deep-link handoff and shared by every
 *        widget instance, plus the default list/completed prefs for widgets placed afterwards.</li>
 *    <li><b>Per-instance</b> (`widget_&lt;id&gt;`): which list this widget shows, its show/hide
 *        completed choice, the last successful item snapshot (the offline fallback), and the last
 *        fetch error.</li>
 *  </ul> */
final class WidgetPrefs {

    static final String GLOBAL_PREFS = "everylist_widget";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_SERVER_URL = "serverUrl";
    private static final String KEY_LIST_IDS = "listIds";
    private static final String KEY_DEFAULT_LIST_ID = "defaultListId";
    private static final String KEY_DEFAULT_SHOW_COMPLETED = "defaultShowCompleted";

    private static final String KEY_LIST_ID = "listId";
    private static final String KEY_LIST_NAME = "listName";
    private static final String KEY_SHOW_COMPLETED = "showCompleted";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_LAST_ERROR = "lastError";

    private final SharedPreferences global;
    private final SharedPreferences instance;

    WidgetPrefs(Context context, int appWidgetId) {
        Context app = context.getApplicationContext();
        this.global = app.getSharedPreferences(GLOBAL_PREFS, Context.MODE_PRIVATE);
        this.instance = app.getSharedPreferences("widget_" + appWidgetId, Context.MODE_PRIVATE);
    }

    // --- Global (provisioned) credentials ---

    static void saveGlobalCredentials(Context context, String token, String serverUrl, List<Long> listIds) {
        StringBuilder sb = new StringBuilder();
        for (Long id : listIds) {
            if (sb.length() > 0) sb.append(',');
            sb.append(id);
        }
        global(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_SERVER_URL, serverUrl)
            .putString(KEY_LIST_IDS, sb.toString())
            .apply();
    }

    static boolean hasGlobalCredentials(Context context) {
        SharedPreferences g = global(context);
        return g.contains(KEY_TOKEN) && g.contains(KEY_SERVER_URL);
    }

    static String getGlobalToken(Context context) {
        return global(context).getString(KEY_TOKEN, "");
    }

    static String getGlobalServerUrl(Context context) {
        return global(context).getString(KEY_SERVER_URL, "");
    }

    static List<Long> getGlobalListIds(Context context) {
        String raw = global(context).getString(KEY_LIST_IDS, "");
        List<Long> ids = new ArrayList<>();
        for (String s : raw.split(",")) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) ids.add(Long.parseLong(trimmed));
        }
        return ids;
    }

    static void setGlobalDefaults(Context context, long listId, boolean showCompleted) {
        global(context).edit()
            .putLong(KEY_DEFAULT_LIST_ID, listId)
            .putBoolean(KEY_DEFAULT_SHOW_COMPLETED, showCompleted)
            .apply();
    }

    static long getGlobalDefaultListId(Context context) {
        return global(context).getLong(KEY_DEFAULT_LIST_ID, -1L);
    }

    static boolean getGlobalDefaultShowCompleted(Context context) {
        return global(context).getBoolean(KEY_DEFAULT_SHOW_COMPLETED, false);
    }

    static SharedPreferences global(Context context) {
        return context.getApplicationContext().getSharedPreferences(GLOBAL_PREFS, Context.MODE_PRIVATE);
    }

    // --- Per-widget instance ---

    boolean hasCredentials() {
        return global.contains(KEY_TOKEN) && global.contains(KEY_SERVER_URL);
    }

    String getToken() {
        return global.getString(KEY_TOKEN, "");
    }

    String getServerUrl() {
        return global.getString(KEY_SERVER_URL, "");
    }

    /** Seeds a freshly-placed widget's list/show-completed from the global defaults. */
    void seedFromDefaults(Context context) {
        long defaultListId = getGlobalDefaultListId(context);
        if (defaultListId > 0 && getListId() <= 0) {
            setListId(defaultListId);
        }
        if (!instance.contains(KEY_SHOW_COMPLETED)) {
            setShowCompleted(getGlobalDefaultShowCompleted(context));
        }
    }

    long getListId() {
        return instance.getLong(KEY_LIST_ID, -1L);
    }

    void setListId(long listId) {
        instance.edit().putLong(KEY_LIST_ID, listId).apply();
    }

    String getListName() {
        return instance.getString(KEY_LIST_NAME, "");
    }

    void setListName(String name) {
        instance.edit().putString(KEY_LIST_NAME, name).apply();
    }

    boolean getShowCompleted() {
        return instance.getBoolean(KEY_SHOW_COMPLETED, false);
    }

    void setShowCompleted(boolean showCompleted) {
        instance.edit().putBoolean(KEY_SHOW_COMPLETED, showCompleted).apply();
    }

    /** Stores the full non-deleted snapshot (unfiltered by show-completed — the factory filters
     *  at render time so toggling show/hide doesn't need a refetch). */
    void saveSnapshot(List<WidgetModels.WidgetItem> items) {
        try {
            instance.edit().putString(KEY_SNAPSHOT, WidgetJson.itemsToJson(items)).apply();
        } catch (JSONException e) {
            // Snapshot is best-effort; a malformed item can't be stored but isn't fatal.
            instance.edit().remove(KEY_SNAPSHOT).apply();
        }
    }

    List<WidgetModels.WidgetItem> loadSnapshot() {
        String json = instance.getString(KEY_SNAPSHOT, null);
        if (json == null) return new ArrayList<>();
        try {
            return WidgetJson.itemsFromJson(json);
        } catch (JSONException e) {
            return new ArrayList<>();
        }
    }

    void setLastError(String message) {
        if (message == null) instance.edit().remove(KEY_LAST_ERROR).apply();
        else instance.edit().putString(KEY_LAST_ERROR, message).apply();
    }

    String getLastError() {
        return instance.getString(KEY_LAST_ERROR, null);
    }
}