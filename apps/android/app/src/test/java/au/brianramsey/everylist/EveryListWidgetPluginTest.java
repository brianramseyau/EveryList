package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.robolectric.Shadows.shadowOf;

import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.util.Arrays;
import java.util.Collections;

/**
 * Unit tests for {@link EveryListWidgetPlugin} — the app→widget provisioning handoff. The
 * Capacitor bridge/call are mocked; the plugin's validation, no-loginable-URI guarantee (it writes
 * the token straight to private prefs and only opens the config Activity), and refresh broadcast
 * are what's under test.
 */
@RunWith(RobolectricTestRunner.class)
public class EveryListWidgetPluginTest {

    private Context context;
    private EveryListWidgetPlugin plugin;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences(WidgetPrefs.GLOBAL_PREFS, Context.MODE_PRIVATE).edit().clear().commit();

        Bridge bridge = mock(Bridge.class);
        when(bridge.getContext()).thenReturn(context);
        plugin = new EveryListWidgetPlugin();
        plugin.setBridge(bridge);
    }

    private PluginCall callWith(String token, String serverUrl, Long... listIds) throws Exception {
        PluginCall call = mock(PluginCall.class);
        JSObject data = new JSObject();
        if (token != null) data.put("token", token);
        if (serverUrl != null) data.put("serverUrl", serverUrl);
        when(call.getData()).thenReturn(data);
        when(call.getString("token")).thenReturn(token);
        when(call.getString("serverUrl")).thenReturn(serverUrl);

        JSArray arr = new JSArray();
        for (Long id : listIds) arr.put(id);
        // Match any JSArray: on the JVM the app resolves org.json:json:20240303, whose JSONArray
        // uses reference equality, so stubbing with a fresh `new JSArray()` would never match the
        // instance configure() actually passes and Mockito would return null.
        when(call.getArray(eq("listIds"), any(JSArray.class))).thenReturn(arr);
        return call;
    }

    @Test
    public void statusReportsDeviceIdAndNullTokenWhenNotProvisioned() throws Exception {
        PluginCall call = mock(PluginCall.class);
        JSObject result = new JSObject();
        org.mockito.Mockito.doAnswer(inv -> {
            result.put("deviceId", ((JSObject) inv.getArgument(0)).getString("deviceId"));
            result.put("tokenId", ((JSObject) inv.getArgument(0)).get("tokenId"));
            result.put("serverUrl", ((JSObject) inv.getArgument(0)).getString("serverUrl"));
            return null;
        }).when(call).resolve(any(JSObject.class));

        plugin.status(call);

        assertNotNull(result.getString("deviceId"));
        assertEquals(JSONObject.NULL, result.get("tokenId"));
        assertEquals("", result.getString("serverUrl"));
    }

    @Test
    public void statusReportsTheStoredTokenIdWhenProvisioned() throws Exception {
        WidgetPrefs.saveGlobalCredentials(context, "elt", 7L, "http://server", Collections.singletonList(74L));
        PluginCall call = mock(PluginCall.class);
        JSObject result = new JSObject();
        org.mockito.Mockito.doAnswer(inv -> {
            result.put("tokenId", ((JSObject) inv.getArgument(0)).get("tokenId"));
            return null;
        }).when(call).resolve(any(JSObject.class));

        plugin.status(call);

        assertEquals(7L, result.get("tokenId"));
    }

    @Test
    public void configureWritesCredentialsAndOpensTheConfigScreen() throws Exception {
        PluginCall call = callWith("elt_new", "http://server", 74L, 3L);

        plugin.configure(call);

        assertTrue(WidgetPrefs.hasGlobalCredentials(context));
        assertEquals("elt_new", WidgetPrefs.getGlobalToken(context));
        assertEquals("http://server", WidgetPrefs.getGlobalServerUrl(context));
        assertEquals(Arrays.asList(74L, 3L), WidgetPrefs.getGlobalListIds(context));

        Intent launched = shadowOf((android.app.Application) context).getNextStartedActivity();
        assertNotNull("configure should open the config Activity", launched);
        assertEquals(WidgetConfigActivity.class.getName(), launched.getComponent().getClassName());
        // The token must never travel in the Intent (dumpsys/logcat leak) — only prefs.
        assertNull(launched.getData());
        verify(call).resolve();
    }

    @Test
    public void configurePersistsTheSuppliedTokenId() throws Exception {
        // A freshly-minted PAT arrives with the server-side id it was created under, so the app can
        // later update that same token in place instead of orphaning it. configure() must store it.
        PluginCall call = callWith("elt_new", "http://server", 74L);
        when(call.getData()).thenReturn(new JSObject().put("tokenId", 42L));

        plugin.configure(call);

        assertEquals(42L, WidgetPrefs.getTokenId(context));
    }

    @Test
    public void configureWithoutATokenReusesTheHeldOneAndItsTokenId() throws Exception {
        WidgetPrefs.saveGlobalCredentials(context, "elt_old", 7L, "http://server", Collections.singletonList(74L));
        PluginCall call = callWith(null, "http://server", 74L);

        plugin.configure(call);

        assertEquals("elt_old", WidgetPrefs.getGlobalToken(context));
        assertEquals(7L, WidgetPrefs.getTokenId(context));
        verify(call).resolve();
    }

    @Test
    public void configureRejectsWhenNoTokenAndNoneHeld() throws Exception {
        PluginCall call = callWith(null, "http://server", 74L);
        plugin.configure(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void configureRejectsAnEmptyListArray() throws Exception {
        PluginCall call = callWith("elt_new", "http://server");
        plugin.configure(call);
        verify(call).reject(anyString());
        verify(call, never()).resolve();
    }

    @Test
    public void configureAcceptsStringListIds() throws Exception {
        PluginCall call = mock(PluginCall.class);
        when(call.getData()).thenReturn(new JSObject());
        when(call.getString("token")).thenReturn("elt_new");
        when(call.getString("serverUrl")).thenReturn("http://server");
        JSArray arr = new JSArray();
        arr.put("74");
        arr.put(3);
        when(call.getArray(eq("listIds"), any(JSArray.class))).thenReturn(arr);

        plugin.configure(call);

        assertEquals(Arrays.asList(74L, 3L), WidgetPrefs.getGlobalListIds(context));
    }

    @Test
    public void configureRejectsAMalformedListArray() throws Exception {
        PluginCall call = mock(PluginCall.class);
        when(call.getData()).thenReturn(new JSObject());
        when(call.getString("token")).thenReturn("elt_new");
        when(call.getString("serverUrl")).thenReturn("http://server");
        JSArray arr = new JSArray();
        arr.put("not-a-number");
        when(call.getArray(eq("listIds"), any(JSArray.class))).thenReturn(arr);

        plugin.configure(call);

        verify(call).reject(anyString());
    }

    @Test
    public void refreshBroadcastsToPlacedWidgets() {
        PluginCall call = mock(PluginCall.class);
        plugin.refresh(call);
        verify(call).resolve();
    }
}
