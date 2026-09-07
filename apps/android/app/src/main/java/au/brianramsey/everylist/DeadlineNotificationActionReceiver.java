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
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Handles the "Complete"/"Snooze 1 hr" actions on a deadline notification (native.ts's
 *  `registerNativeDeadlineActionTypes`) entirely in the background — the patched copy of
 *  `@capacitor/local-notifications` (see the `local-notifications` patch under patches/) routes
 *  any action registered with `foreground: false` to this receiver by explicit component name
 *  instead of launching {@link MainActivity}, so the app is never foregrounded for these two
 *  actions. Mirrors what `push-sw.js`'s `notificationclick` handler already does for the PWA
 *  build (auth via a mirrored token, a direct PATCH, no window opened) — see {@link AuthPrefs} and
 *  {@link DeadlineMath}. */
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
        JSONObject extra;
        long listId;
        long itemId;
        try {
            JSObject notification = new JSObject(notificationJson);
            extra = notification.getJSONObject("extra");
            listId = extra.getLong("listId");
            itemId = extra.getLong("itemId");
        } catch (Exception e) {
            // Malformed/missing payload — nothing sensible to retry, and no listId/itemId to
            // report a failure notification against.
            return;
        }

        String token = AuthPrefs.getToken(context);
        String serverUrl = AuthPrefs.getServerUrl(context);
        if (token == null || serverUrl == null) {
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
            } else if ("snooze".equals(actionId)) {
                String deadline = extra.optString("deadline", null);
                if (deadline == null) return;
                String nextDeadline = DeadlineMath.addHoursToDeadline(deadline, 1, new Date());
                JSONObject body = new JSONObject();
                body.put("deadline", nextDeadline);
                HttpJson.request(
                    "PATCH", serverUrl + "/api/v1/lists/" + listId + "/items/" + itemId, token, body.toString()
                );
            }
        } catch (IOException | org.json.JSONException e) {
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
