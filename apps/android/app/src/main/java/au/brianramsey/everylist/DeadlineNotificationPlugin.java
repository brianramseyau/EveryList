package au.brianramsey.everylist;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Dismisses an already-shown deadline notification from the status bar. Needed because
 *  {@code @capacitor/local-notifications}'s own {@code cancel()} (called from native.ts's
 *  {@code cancelDeadlineNotification}) only cancels a still-*pending* notification's alarm — its
 *  Kotlin implementation deliberately leaves an already-delivered notification's storage record
 *  and on-screen post alone ("cancel only affects pending ones," by its own comment), so it never
 *  dismisses one that's already fired. {@link WidgetUpdater}'s own post-toggle cancel doesn't hit
 *  this because it calls {@link NotificationManagerCompat} directly rather than going through
 *  that plugin; this gives the web app's in-app checkbox path the same direct call. */
@CapacitorPlugin(name = "DeadlineNotifications")
public class DeadlineNotificationPlugin extends Plugin {

    @PluginMethod
    public void dismiss(PluginCall call) {
        int itemId = call.getInt("itemId", -1);
        if (itemId <= 0) {
            call.reject("itemId is required");
            return;
        }
        NotificationManagerCompat.from(getContext()).cancel(itemId);
        call.resolve();
    }
}
