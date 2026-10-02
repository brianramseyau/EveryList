package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
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
 * Unit tests for {@link AuthMirrorPlugin} — the app→native session-token mirror. The Capacitor
 * {@link PluginCall}/{@link Bridge} are mocked (they need a full WebView stack otherwise); the
 * plugin's own validation and its write through {@link AuthPrefs} are what's under test.
 */
@RunWith(RobolectricTestRunner.class)
public class AuthMirrorPluginTest {

    private Context context;
    private AuthMirrorPlugin plugin;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        AuthPrefs.clear(context);

        Bridge bridge = mock(Bridge.class);
        when(bridge.getContext()).thenReturn(context);

        plugin = new AuthMirrorPlugin();
        plugin.setBridge(bridge);
    }

    @Test
    public void setTokenMirrorsTokenAndServerUrl() {
        PluginCall call = mock(PluginCall.class);
        when(call.getString("token")).thenReturn("sess_123");
        when(call.getString("serverUrl")).thenReturn("http://server");

        plugin.setToken(call);

        assertEquals("sess_123", AuthPrefs.getToken(context));
        assertEquals("http://server", AuthPrefs.getServerUrl(context));
        verify(call).resolve();
    }

    @Test
    public void setTokenRejectsAMissingToken() {
        PluginCall call = mock(PluginCall.class);
        when(call.getString("token")).thenReturn(null);
        when(call.getString("serverUrl")).thenReturn("http://server");

        plugin.setToken(call);

        assertNull(AuthPrefs.getToken(context));
        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void setTokenRejectsAnEmptyServerUrl() {
        PluginCall call = mock(PluginCall.class);
        when(call.getString("token")).thenReturn("sess_123");
        when(call.getString("serverUrl")).thenReturn("");

        plugin.setToken(call);

        assertNull(AuthPrefs.getToken(context));
        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void clearTokenWipesTheMirror() {
        AuthPrefs.save(context, "sess_123", "http://server");
        PluginCall call = mock(PluginCall.class);

        plugin.clearToken(call);

        assertNull(AuthPrefs.getToken(context));
        assertNull(AuthPrefs.getServerUrl(context));
        verify(call).resolve();
    }
}
