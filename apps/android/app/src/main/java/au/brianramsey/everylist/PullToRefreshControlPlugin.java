package au.brianramsey.everylist;

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
        ((MainActivity) getActivity()).setPullToRefreshEnabled(enabled);
        call.resolve();
    }
}
