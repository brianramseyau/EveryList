package au.brianramsey.everylist;

import android.content.Context;
import android.content.SharedPreferences;

/** Native mirror of the app's own session token + configured server URL (normally kept in the
 *  WebView's localStorage — see apps/web/src/lib/api/token.ts's `setToken`/`clearToken`), written
 *  via {@link AuthMirrorPlugin}. Lets {@link DeadlineNotificationActionReceiver} authenticate
 *  Complete/Snooze API calls without a WebView, the same way `push-sw.js`'s IndexedDB mirror lets
 *  the PWA's service worker do it without an open tab. Distinct from {@link WidgetPrefs}, which
 *  holds the widget's own separately-scoped Personal Access Token. */
final class AuthPrefs {

    private static final String PREFS_NAME = "everylist_auth";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_SERVER_URL = "serverUrl";

    private AuthPrefs() {}

    static void save(Context context, String token, String serverUrl) {
        prefs(context).edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_SERVER_URL, serverUrl)
            .apply();
    }

    static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }

    static String getToken(Context context) {
        return prefs(context).getString(KEY_TOKEN, null);
    }

    static String getServerUrl(Context context) {
        return prefs(context).getString(KEY_SERVER_URL, null);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
