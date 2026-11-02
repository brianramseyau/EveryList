package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.test.core.app.ApplicationProvider;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import com.getcapacitor.JSObject;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Unit tests for {@link DeadlineNotificationCanceller} — the widget's "check this off and stop its
 * deadline reminder firing" path. Runs under Robolectric so the real plugin storage and the
 * AlarmManager alarm the plugin arms are both observable.
 */
@RunWith(RobolectricTestRunner.class)
public class DeadlineNotificationCancellerTest {

    private static final int ITEM_ID = 42;

    private Context context;
    private AlarmManager alarmManager;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        alarmManager = context.getSystemService(AlarmManager.class);
    }

    /** Arms the same alarm the plugin's triggerScheduledNotification() would for this id. */
    private void armPendingAlarm(int id) {
        int flags = PendingIntent.FLAG_CANCEL_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, id, new Intent(context, TimedNotificationPublisher.class), flags);
        alarmManager.setExact(AlarmManager.RTC, System.currentTimeMillis() + 3_600_000L, pendingIntent);
    }

    private void savePendingRecord(int id) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSObject schedule = new JSObject();
            schedule.put("at", sdf.format(new Date(System.currentTimeMillis() + 3_600_000L)));
            JSObject json = new JSObject();
            json.put("id", id);
            json.put("title", "Milk");
            json.put("body", "");
            json.put("schedule", schedule);
            new NotificationStorage(context).appendNotifications(Collections.singletonList(
                LocalNotification.Companion.buildNotificationFromJSObject(json)));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    @Test
    public void cancelsThePendingAlarmAndForgetsItsStorageRecord() {
        armPendingAlarm(ITEM_ID);
        savePendingRecord(ITEM_ID);
        assertEquals(1, shadowOf(alarmManager).getScheduledAlarms().size());
        assertEquals(1, new NotificationStorage(context).getSavedNotificationIds().size());

        DeadlineNotificationCanceller.cancel(context, ITEM_ID);

        assertTrue("an item checked off early must not fire hours later",
            shadowOf(alarmManager).getScheduledAlarms().isEmpty());
        assertTrue("a reboot must not restore the cancelled reminder",
            new NotificationStorage(context).getSavedNotificationIds().isEmpty());
    }

    @Test
    public void aNonPositiveOrOutOfRangeItemIdIsIgnored() {
        savePendingRecord(ITEM_ID);

        DeadlineNotificationCanceller.cancel(context, 0);
        DeadlineNotificationCanceller.cancel(context, -1);
        DeadlineNotificationCanceller.cancel(context, (long) Integer.MAX_VALUE + 1);

        assertEquals(1, new NotificationStorage(context).getSavedNotificationIds().size());
    }
}
