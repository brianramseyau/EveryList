package au.brianramsey.everylist;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Handles the "Complete" action on a deadline notification (native.ts's
 *  `registerNativeDeadlineActionTypes`) entirely in the background — the patched copy of
 *  `@capacitor/local-notifications` (see the `local-notifications` patch under patches/) routes
 *  any action registered with `foreground: false` to this receiver by explicit component name
 *  instead of launching {@link MainActivity}. Mirrors what `push-sw.js`'s `notificationclick`
 *  handler already does for the PWA build (auth via a mirrored token, a direct PATCH, no window
 *  opened) — see {@link AuthPrefs}.
 *
 *  "Reschedule" (native.ts's `SNOOZE_ACTION_ID`) is also registered `foreground: false`, but it
 *  needs UI (a choice of shortcuts, not a fixed +1hr offset) — the patch gives it its own special
 *  case that launches {@link RescheduleActivity} directly via `PendingIntent.getActivity()`
 *  instead of routing through this receiver at all. A BroadcastReceiver calling `startActivity()`
 *  on tap is exactly the "notification trampoline" pattern Android 12+'s background-activity-
 *  launch restrictions block, which an earlier version of this class hit in practice. So this
 *  receiver only ever sees `"complete"`. */
public class DeadlineNotificationActionReceiver extends BroadcastReceiver {

    private static final String FALLBACK_CHANNEL_ID = "deadline_action_fallback";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onReceive(Context context, Intent intent) {
        int notificationId = intent.getIntExtra(LocalNotificationManager.NOTIFICATION_INTENT_KEY, Integer.MIN_VALUE);
        String actionId = intent.getStringExtra(LocalNotificationManager.ACTION_INTENT_KEY);
        String notificationJson = intent.getStringExtra(LocalNotificationManager.NOTIFICATION_OBJ_INTENT_KEY);
        if (notificationId == Integer.MIN_VALUE || actionId == null || notificationJson == null) {
            return;
        }

        // Dismiss the notification and forget its storage record up front, same as
        // NotificationDismissReceiver does for a swipe-away — the action is handled here either
        // way, so there's nothing left for the plugin's own Activity-launch path to do with it.
        // A malformed payload past this point still surfaces to the user via
        // showFallbackNotification below rather than silently vanishing along with it.
        NotificationManagerCompat.from(context).cancel(notificationId);
        NotificationStorage storage = new NotificationStorage(context);
        LocalNotification existing = storage.getSavedNotification(String.valueOf(notificationId));
        if (LocalNotificationManager.Companion.isSafeToForget(existing)) {
            storage.deleteNotification(String.valueOf(notificationId));
        }

        Context appContext = context.getApplicationContext();
        PendingResult pendingResult = goAsync();
        EXECUTOR.execute(() -> {
            try {
                handleAction(appContext, actionId, notificationJson);
            } finally {
                pendingResult.finish();
            }
        });
    }

    private void handleAction(Context context, String actionId, String notificationJson) {
        JSObject notification;
        JSONObject extra;
        long listId;
        long itemId;
        try {
            notification = new JSObject(notificationJson);
            extra = notification.getJSONObject("extra");
            listId = extra.getLong("listId");
            itemId = extra.getLong("itemId");
        } catch (Exception e) {
            // Malformed/missing payload — nothing sensible to retry, but the notification is
            // already gone by this point (see onReceive), so say so rather than going silent.
            android.util.Log.e("EveryList", "Deadline action " + actionId + ": couldn't parse notification payload", e);
            showFallbackNotification(context);
            return;
        }

        String token = AuthPrefs.getToken(context);
        String serverUrl = AuthPrefs.getServerUrl(context);
        if (token == null || serverUrl == null) {
            android.util.Log.e(
                "EveryList",
                "Deadline action " + actionId + ": no mirrored auth (" + "token="
                    + (token == null ? "missing" : "present") + ", serverUrl=" + (serverUrl == null ? "missing" : serverUrl)
                    + ")"
            );
            showFallbackNotification(context);
            return;
        }

        try {
            if ("complete".equals(actionId)) {
                JSONObject body = new JSONObject();
                body.put("checked", true);
                HttpJson.request(
                    "PATCH", serverUrl + "/api/v1/lists/" + listId + "/items/" + itemId, token, body.toString()
                );
            }
        } catch (IOException | org.json.JSONException | RuntimeException e) {
            // RuntimeException here is deliberately broad: this runs on a background thread with
            // no default UncaughtExceptionHandler installed, so anything that escapes uncaught
            // would otherwise crash the whole app process rather than just degrading to the
            // fallback notification below.
            android.util.Log.e("EveryList", "Deadline action " + actionId + " failed for item " + itemId, e);
            showFallbackNotification(context);
        }
    }

    /** Mirrors push-sw.js's `patchItem` catch branch — the triggering notification is already
     *  dismissed by the time this runs, so without this the user would have no sign the action
     *  didn't actually happen. */
    private void showFallbackNotification(Context context) {
        ensureFallbackChannel(context);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, FALLBACK_CHANNEL_ID)
            .setContentTitle("EveryList")
            .setContentText("Couldn't update the item — open the app and try again.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true);
        NotificationManagerCompat.from(context).notify((int) System.currentTimeMillis(), builder.build());
    }

    private void ensureFallbackChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(FALLBACK_CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                FALLBACK_CHANNEL_ID, "Notification action errors", NotificationManager.IMPORTANCE_DEFAULT
            );
            manager.createNotificationChannel(channel);
        }
    }
}
