package au.brianramsey.everylist;

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
    public void dismissAcceptsAPositiveItemId() {
        PluginCall call = mock(PluginCall.class);
        when(call.getInt("itemId", -1)).thenReturn(11);
        plugin.dismiss(call);
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
