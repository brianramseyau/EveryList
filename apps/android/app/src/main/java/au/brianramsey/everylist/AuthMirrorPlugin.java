package au.brianramsey.everylist;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Mirrors the app's own session token + server URL into native storage (apps/web/src/lib/
 *  auth-mirror.ts calls this from token.ts's setToken/clearToken), so
 *  {@link DeadlineNotificationActionReceiver} can authenticate the deadline notification's
 *  "Complete"/"Snooze" actions without a WebView — the native counterpart of `push-sw.js`'s
 *  IndexedDB token mirror for the PWA build. Android-only: iOS's `foreground: false` already
 *  keeps those actions off the UI thread with no native mirror needed. */
@CapacitorPlugin(name = "AuthMirror")
public class AuthMirrorPlugin extends Plugin {

    @PluginMethod
    public void setToken(PluginCall call) {
        String token = call.getString("token");
        String serverUrl = call.getString("serverUrl");
        if (token == null || token.isEmpty() || serverUrl == null || serverUrl.isEmpty()) {
            call.reject("token and serverUrl are required");
            return;
        }
        AuthPrefs.save(getContext(), token, serverUrl);
        call.resolve();
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        AuthPrefs.clear(getContext());
        call.resolve();
    }
}
