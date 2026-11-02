package au.brianramsey.everylist;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;

/** Fully cancels one item's deadline notification from native code — used by
 *  {@link WidgetUpdater}, which checks an item off by PATCHing the server directly and so never
 *  passes through the web app's `cancelDeadlineNotification`.
 *
 *  <p>{@link NotificationManagerCompat#cancel} alone only dismisses a notification that has
 *  already been posted; it leaves {@code @capacitor/local-notifications}' still-pending
 *  {@link AlarmManager} alarm armed, so an item checked off hours before its deadline would still
 *  fire later. This mirrors the plugin's own {@code cancel()} bookkeeping: cancel the pending
 *  alarm, then delete its storage record so a reboot's restore pass can't re-arm it either. The
 *  notification id is the item id, the same scheme {@code native.ts}'s
 *  {@code syncNativeDeadlineNotifications} schedules with. */
final class DeadlineNotificationCanceller {

    private DeadlineNotificationCanceller() {}

    static void cancel(Context context, long itemId) {
        if (itemId <= 0 || itemId > Integer.MAX_VALUE) return;
        int notificationId = (int) itemId;

        NotificationManagerCompat.from(context).cancel(notificationId);
        cancelPendingAlarm(context, notificationId);
        new NotificationStorage(context).deleteNotification(String.valueOf(notificationId));
    }

    private static void cancelPendingAlarm(Context context, int notificationId) {
        AlarmManager alarmManager = context.getSystemService(AlarmManager.class);
        if (alarmManager == null) return;

        // Same intent the plugin arms with in triggerScheduledNotification(), and the same flags
        // its cancelTimerForNotification() looks it up with.
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context, notificationId, new Intent(context, TimedNotificationPublisher.class), flags);
        if (pendingIntent == null) return;

        alarmManager.cancel(pendingIntent);
        pendingIntent.cancel();
    }
}
