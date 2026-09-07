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
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Handles the "Complete"/"Snooze 1 hr" actions on a deadline notification (native.ts's
 *  `registerNativeDeadlineActionTypes`) entirely in the background — the patched copy of
 *  `@capacitor/local-notifications` (see the `local-notifications` patch under patches/) routes
 *  any action registered with `foreground: false` to this receiver by explicit component name
 *  instead of launching {@link MainActivity}, so the app is never foregrounded for these two
 *  actions. Mirrors what `push-sw.js`'s `notificationclick` handler already does for the PWA
 *  build (auth via a mirrored token, a direct PATCH, no window opened) — see {@link AuthPrefs} and
 *  {@link DeadlineMath}. Snooze specifically mirrors native.ts's own `snoozeFromNotification`
 *  (re-fetching the item's live deadline rather than the notification's — possibly stale —
 *  captured one, and rescheduling a follow-up local notification), not push-sw.js's simpler
 *  stale-deadline version, since native.ts is the more-correct of the two existing precedents and
 *  the local scheduling APIs needed to reschedule are available here regardless. */
public class DeadlineNotificationActionReceiver extends BroadcastReceiver {

    private static final String FALLBACK_CHANNEL_ID = "deadline_action_fallback";
    private static final String JS_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
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
            } else if ("snooze".equals(actionId)) {
                snooze(context, serverUrl, token, listId, itemId, notification);
            }
        } catch (IOException | org.json.JSONException | RuntimeException e) {
            // RuntimeException here is deliberately broad: this runs on a background thread with
            // no default UncaughtExceptionHandler installed, so anything that escapes uncaught
            // (a malformed `deadline` from the API throwing NumberFormatException, or an
            // unaudited corner of LocalNotificationManager's internals reacting badly to being
            // driven outside its usual Activity-bound Plugin lifecycle) would otherwise crash the
            // whole app process rather than just degrading to the fallback notification below.
            android.util.Log.e("EveryList", "Deadline action " + actionId + " failed for item " + itemId, e);
            showFallbackNotification(context);
        }
    }

    /** Mirrors native.ts's `snoozeFromNotification`: re-fetches the item's *live* deadline
     *  (rather than trusting the notification's own, possibly-stale, captured one — the item may
     *  have been edited since this notification was scheduled) before computing the new deadline,
     *  then reschedules a follow-up local notification the same way `LocalNotifications.schedule`
     *  does from JS. Does nothing if the item has since lost its deadline or been deleted, same as
     *  the JS version. */
    private void snooze(
        Context context, String serverUrl, String token, long listId, long itemId, JSObject originalNotification
    ) throws IOException, org.json.JSONException {
        String itemsBody = HttpJson.request("GET", serverUrl + "/api/v1/lists/" + listId + "/items", token, null);
        // Every API response is enveloped as `{"data": ...}` (WidgetJson.java parses the same
        // shape for the widget's own API calls) — parsing itemsBody directly as a JSONArray here
        // threw on every real request (`{"data":[...]} ... cannot be converted to JSONArray`),
        // which is why every Snooze tap unconditionally hit the fallback notification.
        JSONArray items = new JSONObject(itemsBody).getJSONArray("data");
        String liveDeadline = findItemDeadline(items, itemId);
        if (liveDeadline == null) return;

        String nextDeadline = DeadlineMath.addHoursToDeadline(liveDeadline, 1, new Date());

        JSONObject body = new JSONObject();
        body.put("deadline", nextDeadline);
        HttpJson.request(
            "PATCH", serverUrl + "/api/v1/lists/" + listId + "/items/" + itemId, token, body.toString()
        );

        // Deliberately isolated from the PATCH above: the deadline update already succeeded by
        // this point, so a failure only here shouldn't surface as "couldn't update the item" (the
        // item *did* update — only the local follow-up reminder failed to reschedule). Matches
        // native.ts's own snoozeFromNotification, where an equivalent LocalNotifications.schedule
        // failure after a successful updateItem is likewise just logged, not reported to the user
        // as an update failure.
        try {
            rescheduleNotification(context, originalNotification, nextDeadline);
        } catch (org.json.JSONException | java.text.ParseException | RuntimeException e) {
            android.util.Log.e(
                "EveryList", "Snoozed item " + itemId + " but failed to reschedule its follow-up notification", e
            );
        }
    }

    private String findItemDeadline(JSONArray items, long itemId) throws org.json.JSONException {
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.getJSONObject(i);
            if (item.getLong("id") == itemId && !item.isNull("deadline")) {
                return item.getString("deadline");
            }
        }
        return null;
    }

    /** Rebuilds the same notification the plugin would from a fresh
     *  `LocalNotifications.schedule` JS call — same id/title/body/actionTypeId, `extra.deadline`
     *  updated to the new value, and a new trigger time — then hands it to a throwaway
     *  {@link LocalNotificationManager} the same way the plugin's own schedule() call does. */
    private void rescheduleNotification(Context context, JSObject originalNotification, String nextDeadline)
        throws org.json.JSONException, java.text.ParseException {
        JSONObject extra = originalNotification.getJSONObject("extra");
        extra.put("deadline", nextDeadline);
        originalNotification.put("extra", extra);

        Calendar trigger = DeadlineMath.triggerDate(nextDeadline);
        SimpleDateFormat sdf = new SimpleDateFormat(JS_DATE_FORMAT, Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONObject schedule = new JSONObject();
        schedule.put("at", sdf.format(trigger.getTime()));
        originalNotification.put("schedule", schedule);

        LocalNotification updated = LocalNotification.Companion.buildNotificationFromJSObject(originalNotification);
        LocalNotificationManager manager = new LocalNotificationManager(
            new NotificationStorage(context), null, context, CapConfig.loadDefault(context)
        );
        manager.schedule(null, Collections.singletonList(updated));
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
