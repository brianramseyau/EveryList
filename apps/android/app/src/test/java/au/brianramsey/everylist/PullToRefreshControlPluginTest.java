package au.brianramsey.everylist;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.Bridge;
import com.getcapacitor.PluginCall;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * Unit tests for {@link PullToRefreshControlPlugin} — its validation branches plus the success and
 * failure paths through {@link MainActivity#setPullToRefreshEnabled}. The bridge/activity are
 * mocked (a real MainActivity builds a full Capacitor Bridge); {@code runOnUiThread} is stubbed to
 * run inline so the result is observable, matching the plugin's own resolve-inside-the-runnable
 * contract.
 */
@RunWith(RobolectricTestRunner.class)
public class PullToRefreshControlPluginTest {

    private PullToRefreshControlPlugin plugin;

    @Before
    public void setUp() {
        plugin = new PullToRefreshControlPlugin();
    }

    private MainActivity mockActivityRunningInline() {
        MainActivity activity = mock(MainActivity.class);
        doAnswer(inv -> {
            ((Runnable) inv.getArgument(0)).run();
            return null;
        }).when(activity).runOnUiThread(any(Runnable.class));
        return activity;
    }

    private PluginCall call(boolean enabled) {
        PluginCall call = mock(PluginCall.class);
        when(call.getBoolean("enabled")).thenReturn(enabled);
        return call;
    }

    @Test
    public void rejectsWhenEnabledIsMissing() {
        plugin.setBridge(mock(Bridge.class));
        PluginCall call = mock(PluginCall.class);
        when(call.getBoolean("enabled")).thenReturn(null);

        plugin.setEnabled(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void rejectsWhenTheActivityIsNotAMainActivity() {
        Bridge bridge = mock(Bridge.class);
        when(bridge.getActivity()).thenReturn(mock(AppCompatActivity.class));
        plugin.setBridge(bridge);
        PluginCall call = call(true);

        plugin.setEnabled(call);

        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void appliesEnabledOnTheUiThreadAndResolves() {
        MainActivity activity = mockActivityRunningInline();
        Bridge bridge = mock(Bridge.class);
        when(bridge.getActivity()).thenReturn(activity);
        plugin.setBridge(bridge);

        PluginCall call = call(false);
        plugin.setEnabled(call);

        verify(activity).setPullToRefreshEnabled(false);
        verify(call).resolve();
    }

    @Test
    public void rejectsWhenTheUiThreadMutationThrows() {
        MainActivity activity = mockActivityRunningInline();
        doThrow(new RuntimeException("wrong thread")).when(activity).setPullToRefreshEnabled(anyBoolean());
        Bridge bridge = mock(Bridge.class);
        when(bridge.getActivity()).thenReturn(activity);
        plugin.setBridge(bridge);

        PluginCall call = call(true);
        plugin.setEnabled(call);

        verify(call).reject(anyString(), any(RuntimeException.class));
        verify(call, never()).resolve();
    }
}

