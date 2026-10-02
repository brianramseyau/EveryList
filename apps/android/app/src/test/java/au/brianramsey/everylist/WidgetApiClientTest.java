package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.util.List;

/**
 * Unit tests for {@link WidgetApiClient} — the URL paths, query params, and JSON payloads the
 * widget's PAT-authenticated calls put on the wire. Pure JVM, against the shared
 * {@link MiniHttpServer}: asserts the exact request the API sees, which is what catches a drifted
 * endpoint path or a mis-shaped body (the kind of bug that only shows up as a runtime 404/422 on a
 * real device). Bodies are compared by parsing rather than string equality, since org.json doesn't
 * guarantee key order.
 */
public class WidgetApiClientTest {

    private MiniHttpServer server;

    @Before
    public void startServer() throws Exception {
        server = new MiniHttpServer();
    }

    @After
    public void stopServer() throws Exception {
        if (server != null) server.close();
    }

    @Test
    public void fetchLists_getstheListsEndpointAndParsesTheEnvelope() throws Exception {
        server.respondWith(200, "{\"data\":[{\"id\":3,\"name\":\"Groceries\"}]}");
        List<WidgetModels.WidgetList> lists = WidgetApiClient.fetchLists("t", server.url(""));

        assertEquals(1, lists.size());
        assertEquals(3L, lists.get(0).id);
        assertEquals("Groceries", lists.get(0).name);
        MiniHttpServer.Recorded r = server.requests.get(0);
        assertEquals("GET", r.method);
        assertEquals("/api/v1/lists", r.path);
        assertEquals("Bearer t", r.headers.get("authorization"));
    }

    @Test
    public void fetchWidgetSnapshot_includesListIdAndCheckedFlag() throws Exception {
        server.respondWith(200, "{\"data\":{\"listName\":\"TODO\",\"useDeadline\":true,\"items\":[]}}");
        WidgetModels.WidgetSnapshot snap =
            WidgetApiClient.fetchWidgetSnapshot("t", server.url(""), 74L, true);

        assertEquals("TODO", snap.listName);
        assertTrue(snap.useDeadline);
        assertEquals("/api/v1/lists/74/widget-snapshot?includeChecked=true",
            server.requests.get(0).path);
    }

    @Test
    public void fetchWidgetSnapshot_checkedFlagFalseAlsoEncoded() throws Exception {
        server.respondWith(200, "{\"data\":{\"listName\":\"x\",\"items\":[]}}");
        WidgetApiClient.fetchWidgetSnapshot("t", server.url(""), 9L, false);
        assertEquals("/api/v1/lists/9/widget-snapshot?includeChecked=false",
            server.requests.get(0).path);
    }

    @Test
    public void createItem_withoutDeadlineOmitsTheField() throws Exception {
        server.respondWith(201, "{\"data\":{\"id\":11}}");
        String response = WidgetApiClient.createItem("t", server.url(""), 74L, "Milk", null);

        assertEquals("{\"data\":{\"id\":11}}", response);
        MiniHttpServer.Recorded r = server.requests.get(0);
        assertEquals("POST", r.method);
        assertEquals("/api/v1/lists/74/items", r.path);
        assertEquals("application/json", r.headers.get("content-type"));
        JSONObject sent = new JSONObject(r.body);
        assertEquals("Milk", sent.getString("name"));
        // A name-only add must not send `deadline: null` — the server's create validator rejects it.
        assertFalse(sent.has("deadline"));
    }

    @Test
    public void createItem_withDeadlineIncludesIt() throws Exception {
        server.respondWith(201, "{\"data\":{\"id\":11,\"deadline\":\"2026-09-30\"}}");
        WidgetApiClient.createItem("t", server.url(""), 74L, "Milk", "2026-09-30");
        JSONObject sent = new JSONObject(server.requests.get(0).body);
        assertEquals("Milk", sent.getString("name"));
        assertEquals("2026-09-30", sent.getString("deadline"));
    }

    @Test
    public void malformedListsResponseSurfacesAsIoException() {
        // A 200 that isn't the expected envelope: HttpJson succeeds, parsing throws, and the
        // client wraps it — the caller's catch sees an IOException either way, not a raw JSON error.
        server.respondWith(200, "not json at all");
        try {
            WidgetApiClient.fetchLists("t", server.url(""));
            org.junit.Assert.fail("expected IOException for a malformed lists body");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("Malformed"));
        }
    }

    @Test
    public void invalidJsonSnapshotSurfacesAsIoException() {
        // A body that isn't JSON at all makes WidgetJson.parseWidgetSnapshot throw, which the
        // client wraps. (A well-formed body whose `data` isn't an object is a *valid* empty
        // snapshot — see WidgetJsonTest — so this uses genuinely malformed JSON to hit the catch.)
        server.respondWith(200, "not json");
        try {
            WidgetApiClient.fetchWidgetSnapshot("t", server.url(""), 1L, false);
            org.junit.Assert.fail("expected IOException for an invalid-JSON snapshot body");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("Malformed"));
        }
    }

    // No tests here for updateItemDeadline/toggleItem's *HTTP method*: the JDK's
    // HttpURLConnection refuses PATCH outright ("Invalid HTTP method"), so the request never
    // reaches MiniHttpServer in a JVM test. Android uses an OkHttp-backed connection that
    // supports PATCH. The URL/payload shapes of both are covered in WidgetApiClientPatchTest
    // through the HttpJson transport seam, which bypasses that JDK limitation.
}
