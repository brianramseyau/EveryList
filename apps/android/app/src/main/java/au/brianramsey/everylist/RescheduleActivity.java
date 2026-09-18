package au.brianramsey.everylist;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.TimePickerDialog;
import android.content.DialogInterface;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;

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

/** The deadline notification's "Reschedule" action popup — launched by
 *  {@link DeadlineNotificationActionReceiver} instead of that receiver PATCHing an instant +1hr
 *  snooze itself, so the user gets a choice of shortcuts (1 hour, tomorrow, this weekend, next
 *  week, a custom date/time) rather than a fixed offset. Styled as a floating card
 *  (AppTheme.WidgetDialog), same "instant popup over whatever's on screen" pattern as the widget's
 *  "+" quick-add popup (QuickAddActivity) — cold-launching the whole Capacitor WebView just to
 *  show this picker would be slow and would lose the "background action" feel the deadline
 *  notification's other action (Complete) already has. Authenticates with the app's own mirrored
 *  session token ({@link AuthPrefs}), same as the receiver that launches it — not
 *  {@link WidgetPrefs}'s separately-scoped widget PAT. */
public class RescheduleActivity extends Activity {

    static final String EXTRA_LIST_ID = "au.brianramsey.everylist.EXTRA_LIST_ID";
    static final String EXTRA_ITEM_ID = "au.brianramsey.everylist.EXTRA_ITEM_ID";
    static final String EXTRA_NOTIFICATION_JSON = "au.brianramsey.everylist.EXTRA_NOTIFICATION_JSON";

    private static final String JS_DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private long listId;
    private long itemId;
    private String notificationJson;
    private String token;
    private String serverUrl;

    /** The item's live deadline, populated once {@link #loadDeadline()} resolves — null until
     *  then, and null-forever means "give up and finish" (see that method). */
    private String liveDeadline;

    private Button oneHourButton;
    private Button tomorrowButton;
    private Button weekendButton;
    private Button nextWeekButton;
    private Button customButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN);
        setContentView(R.layout.reschedule);

        listId = getIntent().getLongExtra(EXTRA_LIST_ID, -1L);
        itemId = getIntent().getLongExtra(EXTRA_ITEM_ID, -1L);
        notificationJson = getIntent().getStringExtra(EXTRA_NOTIFICATION_JSON);
        token = AuthPrefs.getToken(this);
        serverUrl = AuthPrefs.getServerUrl(this);

        if (listId <= 0 || itemId <= 0 || token == null || serverUrl == null) {
            finish();
            return;
        }

        oneHourButton = findViewById(R.id.reschedule_one_hour);
        tomorrowButton = findViewById(R.id.reschedule_tomorrow);
        weekendButton = findViewById(R.id.reschedule_weekend);
        nextWeekButton = findViewById(R.id.reschedule_next_week);
        customButton = findViewById(R.id.reschedule_custom);
        Button cancelButton = findViewById(R.id.reschedule_cancel);

        cancelButton.setOnClickListener(v -> finish());
        tomorrowButton.setOnClickListener(v -> applyShortcut(DeadlineMath.tomorrowDeadline(liveDeadline, new Date())));
        weekendButton.setOnClickListener(v -> applyShortcut(DeadlineMath.thisWeekendDeadline(liveDeadline, new Date())));
        nextWeekButton.setOnClickListener(v -> applyShortcut(DeadlineMath.nextWeekDeadline(liveDeadline, new Date())));
        oneHourButton.setOnClickListener(v -> applyShortcut(DeadlineMath.addHoursToDeadline(liveDeadline, 1, new Date())));
        customButton.setOnClickListener(v -> showCustomPicker());

        loadDeadline();
    }

    /** Fetches the item's *live* deadline (rather than trusting the notification's own, possibly
     *  stale, captured one) off the main thread — same reasoning and endpoint
     *  {@link DeadlineNotificationActionReceiver} used for its own snooze before this Activity
     *  existed. Enables the shortcut buttons on success; on any failure (offline, deleted item,
     *  the item having since lost its deadline, a malformed response) shows the same fallback
     *  notification the receiver's other actions use and finishes, since there is nothing sensible
     *  left to offer. */
    private void loadDeadline() {
        new Thread(() -> {
            try {
                String itemsBody = HttpJson.request("GET", serverUrl + "/api/v1/lists/" + listId + "/items", token, null);
                JSONArray items = new JSONObject(itemsBody).getJSONArray("data");
                String deadline = findItemDeadline(items, itemId);
                if (deadline == null) {
                    mainHandler.post(this::finish);
                    return;
                }
                mainHandler.post(() -> onDeadlineLoaded(deadline));
            } catch (IOException | org.json.JSONException e) {
                android.util.Log.e("EveryList", "Reschedule popup: failed to load item " + itemId, e);
                mainHandler.post(() -> {
                    showFallbackNotification();
                    finish();
                });
            }
        }).start();
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

    private void onDeadlineLoaded(String deadline) {
        liveDeadline = deadline;
        boolean hasTime = deadline.length() > 10;
        oneHourButton.setVisibility(hasTime ? View.VISIBLE : View.GONE);
        oneHourButton.setEnabled(true);
        tomorrowButton.setEnabled(true);
        weekendButton.setEnabled(true);
        nextWeekButton.setEnabled(true);
        customButton.setEnabled(true);
    }

    private void showCustomPicker() {
        Calendar seed = Calendar.getInstance();
        DatePickerDialog dateDialog = new DatePickerDialog(
            this,
            (view, year, month, dayOfMonth) -> showCustomTimePicker(year, month, dayOfMonth),
            seed.get(Calendar.YEAR),
            seed.get(Calendar.MONTH),
            seed.get(Calendar.DAY_OF_MONTH)
        );
        dateDialog.show();
    }

    private void showCustomTimePicker(int year, int month, int dayOfMonth) {
        String datePart = String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, dayOfMonth);
        Calendar now = Calendar.getInstance();
        TimePickerDialog timeDialog = new TimePickerDialog(
            this,
            (view, hourOfDay, minute) ->
                applyShortcut(datePart + String.format(Locale.US, "T%02d:%02d", hourOfDay, minute)),
            now.get(Calendar.HOUR_OF_DAY),
            now.get(Calendar.MINUTE),
            false
        );
        // A custom pick doesn't require a time — matching the web overlay's optional time field —
        // so the negative button applies the date alone instead of just dismissing.
        timeDialog.setButton(DialogInterface.BUTTON_NEGATIVE, getString(R.string.reschedule_no_time),
            (dialog, which) -> applyShortcut(datePart));
        timeDialog.show();
    }

    private void applyShortcut(String nextDeadline) {
        setButtonsEnabled(false);
        new Thread(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("deadline", nextDeadline);
                HttpJson.request("PATCH", serverUrl + "/api/v1/lists/" + listId + "/items/" + itemId, token, body.toString());
            } catch (IOException | org.json.JSONException e) {
                android.util.Log.e("EveryList", "Reschedule popup: failed to update item " + itemId, e);
                mainHandler.post(() -> {
                    showFallbackNotification();
                    finish();
                });
                return;
            }

            // Deliberately isolated from the PATCH above: the deadline update already succeeded
            // by this point, so a failure only here shouldn't surface as "couldn't reschedule" —
            // the item did update, only the local follow-up reminder failed to reschedule. Mirrors
            // DeadlineNotificationActionReceiver's own snooze()/rescheduleNotification split.
            try {
                rescheduleNotification(nextDeadline);
            } catch (org.json.JSONException | java.text.ParseException | RuntimeException e) {
                android.util.Log.e(
                    "EveryList", "Rescheduled item " + itemId + " but failed to reschedule its follow-up notification", e
                );
            }
            mainHandler.post(this::finish);
        }).start();
    }

    private void setButtonsEnabled(boolean enabled) {
        oneHourButton.setEnabled(enabled);
        tomorrowButton.setEnabled(enabled);
        weekendButton.setEnabled(enabled);
        nextWeekButton.setEnabled(enabled);
        customButton.setEnabled(enabled);
    }

    private static final String FALLBACK_CHANNEL_ID = "deadline_action_fallback";

    /** Same fallback-notification pattern as
     *  {@code DeadlineNotificationActionReceiver#showFallbackNotification} — the triggering
     *  notification is already dismissed by the time either failure path here runs, so without
     *  this the user would have no sign Reschedule didn't actually happen. */
    private void showFallbackNotification() {
        ensureFallbackChannel();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, FALLBACK_CHANNEL_ID)
            .setContentTitle("EveryList")
            .setContentText("Couldn't update the item — open the app and try again.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true);
        NotificationManagerCompat.from(this).notify((int) System.currentTimeMillis(), builder.build());
    }

    private void ensureFallbackChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(FALLBACK_CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                FALLBACK_CHANNEL_ID, "Notification action errors", NotificationManager.IMPORTANCE_DEFAULT
            );
            manager.createNotificationChannel(channel);
        }
    }

    /** Rebuilds the same notification the plugin would from a fresh `LocalNotifications.schedule`
     *  JS call — same id/title/body/actionTypeId, `extra.deadline` updated to the new value, and a
     *  new trigger time — then hands it to a throwaway {@link LocalNotificationManager}, mirroring
     *  what {@code DeadlineNotificationActionReceiver} used to do for its own snooze. */
    private void rescheduleNotification(String nextDeadline) throws org.json.JSONException, java.text.ParseException {
        if (notificationJson == null) return;
        JSObject notification = new JSObject(notificationJson);
        JSONObject extra = notification.getJSONObject("extra");
        extra.put("deadline", nextDeadline);
        notification.put("extra", extra);

        Calendar trigger = DeadlineMath.triggerDate(nextDeadline);
        SimpleDateFormat sdf = new SimpleDateFormat(JS_DATE_FORMAT, Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONObject schedule = new JSONObject();
        schedule.put("at", sdf.format(trigger.getTime()));
        notification.put("schedule", schedule);

        LocalNotification updated = LocalNotification.Companion.buildNotificationFromJSObject(notification);
        LocalNotificationManager manager = new LocalNotificationManager(
            new NotificationStorage(this), null, this, CapConfig.loadDefault(this)
        );
        manager.schedule(null, Collections.singletonList(updated));
    }
}
