package au.brianramsey.everylist;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app temporarily disable/re-enable native pull-to-refresh (see
 * MainActivity#setPullToRefreshEnabled and its RefreshGestureAwareLayout) — used by the undo
 * toast's swipe-to-dismiss gesture (UndoToast.svelte / pull-to-refresh.ts on the web side), whose
 * plain vertical drag has no timing or direction signal left for the native gesture heuristics to
 * key off.
 */
@CapacitorPlugin(name = "PullToRefreshControl")
public class PullToRefreshControlPlugin extends Plugin {

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled is required");
            return;
        }
        // getActivity() can be null (the bridge clears it once the activity stops) and, in
        // principle, isn't guaranteed to be a MainActivity — guard both rather than assuming.
        Activity activity = getActivity();
        if (!(activity instanceof MainActivity)) {
            call.reject("no active MainActivity to control pull-to-refresh on");
            return;
        }
        MainActivity mainActivity = (MainActivity) activity;
        // Plugin methods run on Capacitor's own "CapacitorPlugins" handler thread, not the main
        // thread — MainActivity#setPullToRefreshEnabled touches the SwipeRefreshLayout view
        // hierarchy (setEnabled -> reset -> bringToFront), which throws
        // ViewRootImpl$CalledFromWrongThreadException off the main thread. Resolving from inside
        // the runnable (rather than right after posting it) makes the promise reflect the
        // mutation actually completing, not just being scheduled.
        activity.runOnUiThread(() -> {
            try {
                mainActivity.setPullToRefreshEnabled(enabled);
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("failed to update pull-to-refresh state", e);
            }
        });
    }
}
