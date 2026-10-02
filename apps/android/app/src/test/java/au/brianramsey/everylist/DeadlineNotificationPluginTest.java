package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.PluginCall;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * Unit tests for {@link DeadlineNotificationPlugin} — dismisses an already-shown deadline
 * notification by item id (the plugin's own cancel() only cancels pending ones).
 */
@RunWith(RobolectricTestRunner.class)
public class DeadlineNotificationPluginTest {

    private Context context;
    private DeadlineNotificationPlugin plugin;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        Bridge bridge = mock(Bridge.class);
        when(bridge.getContext()).thenReturn(context);
        plugin = new DeadlineNotificationPlugin();
        plugin.setBridge(bridge);
    }

    @Test
    public void dismissCancelsTheShownNotificationAndResolves() {
        // Post a notification under item id 11, then dismiss it: the plugin's whole job is the
        // direct NotificationManagerCompat.cancel(itemId) that the stock plugin's cancel() misses
        // for an already-delivered notification.
        android.app.NotificationManager manager =
            (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        android.app.Notification notification = new android.app.Notification.Builder(context, "test")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build();
        manager.notify(11, notification);
        assertEquals(1, org.robolectric.Shadows.shadowOf(manager).size());

        PluginCall call = mock(PluginCall.class);
        when(call.getInt("itemId", -1)).thenReturn(11);
        plugin.dismiss(call);

        assertEquals("dismiss must cancel the shown notification", 0,
            org.robolectric.Shadows.shadowOf(manager).size());
        verify(call).resolve();
    }

    @Test
    public void dismissRejectsAMissingOrInvalidItemId() {
        PluginCall call = mock(PluginCall.class);
        when(call.getInt("itemId", -1)).thenReturn(-1);
        plugin.dismiss(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void dismissRejectsAnItemIdOfZero() {
        PluginCall call = mock(PluginCall.class);
        when(call.getInt("itemId", -1)).thenReturn(0);
        plugin.dismiss(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }
}
