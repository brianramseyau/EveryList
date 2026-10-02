package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;

/**
 * Covers the two {@link WidgetApiClient} calls {@link WidgetApiClientTest} documents as
 * untestable: the JDK's {@code HttpURLConnection} refuses PATCH, so they never reach a real
 * socket in a JVM test. Driving them through the {@link HttpJson} transport seam verifies the
 * exact method, path, and JSON body without a connection at all.
 */
public class WidgetApiClientPatchTest {

    private RecordingTransport transport;

    @Before
    public void setUp() {
        transport = new RecordingTransport();
        HttpJson.setTransportForTesting(transport);
    }

    @After
    public void tearDown() {
        HttpJson.resetTransportForTesting();
    }

    @Test
    public void updateItemDeadline_patchesTheItemWithADeadlineBody() throws Exception {
        WidgetApiClient.updateItemDeadline("t", "http://s", 74L, 11L, "2026-09-30T10:00");

        RecordingTransport.Call call = transport.last();
        assertEquals("PATCH", call.method);
        assertEquals("http://s/api/v1/lists/74/items/11", call.url);
        // The seam sits below header assembly, so the raw token is what the transport sees; the
        // "Bearer " prefix itself is covered by HttpJsonTest against a real socket.
        assertEquals("t", call.token);
        JSONObject sent = new JSONObject(call.body);
        assertEquals("2026-09-30T10:00", sent.getString("deadline"));
    }

    @Test
    public void toggleItem_patchesTheItemWithACheckedBody() throws Exception {
        WidgetApiClient.toggleItem("t", "http://s", 74L, 11L, true);

        RecordingTransport.Call call = transport.last();
        assertEquals("PATCH", call.method);
        assertEquals("http://s/api/v1/lists/74/items/11", call.url);
        JSONObject sent = new JSONObject(call.body);
        assertTrue(sent.getBoolean("checked"));
    }

    @Test
    public void toggleItem_checkedFalseIsAlsoEncoded() throws Exception {
        WidgetApiClient.toggleItem("t", "http://s", 1L, 2L, false);
        assertFalse(new JSONObject(transport.last().body).getBoolean("checked"));
    }

    @Test
    public void aFailedPatchSurfacesAsIoException() {
        transport.failAlways(new IOException("API returned 500"));
        try {
            WidgetApiClient.toggleItem("t", "http://s", 1L, 2L, true);
            fail("expected IOException");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("500"));
        }
    }
}
