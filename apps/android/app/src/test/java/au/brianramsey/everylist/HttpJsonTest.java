package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;

/**
 * Unit tests for {@link HttpJson} — the blocking bearer-token HTTP plumbing shared by the widget's
 * PAT calls and the deadline-notification actions. Runs on the JVM against a real in-process socket
 * server ({@link MiniHttpServer}), so the request path, status handling, body read, and disconnect
 * are all exercised for real rather than mocked away.
 */
public class HttpJsonTest {

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
    public void get_sendsBearerTokenAndAcceptHeader_noBody() throws Exception {
        server.respondWith(200, "{\"data\":[]}");
        String body = HttpJson.request("GET", server.url("/lists"), "elt_abc", null);

        assertEquals("{\"data\":[]}", body);
        assertEquals(1, server.requests.size());
        MiniHttpServer.Recorded r = server.requests.get(0);
        assertEquals("GET", r.method);
        assertEquals("Bearer elt_abc", r.headers.get("authorization"));
        assertEquals("application/json", r.headers.get("accept"));
        assertNull("a GET with no body must not set Content-Type", r.headers.get("content-type"));
        assertEquals("", r.body);
    }

    @Test
    public void post_streamsJsonBodyAndContentType() throws Exception {
        server.respondWith(201, "{\"data\":{\"id\":7}}");
        String body = HttpJson.request("POST", server.url("/items"), "elt_xyz", "{\"name\":\"Milk\"}");

        assertEquals("{\"data\":{\"id\":7}}", body);
        MiniHttpServer.Recorded r = server.requests.get(0);
        assertEquals("POST", r.method);
        assertEquals("application/json", r.headers.get("content-type"));
        assertEquals("{\"name\":\"Milk\"}", r.body);
    }

    @Test
    public void non2xxThrowsIoExceptionWithTheStatusCode() {
        server.respondWith(500, "server error");
        try {
            HttpJson.request("GET", server.url("/boom"), "t", null);
            org.junit.Assert.fail("expected IOException for a 500");
        } catch (IOException e) {
            assertTrue("message should carry the status code, was: " + e.getMessage(),
                e.getMessage().contains("500"));
        }
    }

    @Test
    public void redirectStatusIsTreatedAsFailure() {
        // 3xx is outside the 2xx success window, so it surfaces as an IOException rather than a
        // silently-followed redirect. No Location header is sent, so HttpURLConnection has nothing
        // to follow and hands the 302 straight back.
        server.respondWith(302, "");
        try {
            HttpJson.request("GET", server.url("/redir"), "t", null);
            org.junit.Assert.fail("expected IOException for a 302");
        } catch (IOException e) {
            assertTrue(e.getMessage().contains("302"));
        }
    }

    @Test
    public void readsAMultiBufferResponseBodyIntact() throws Exception {
        // Larger than the 4096-byte read buffer, so the readAll loop's second iteration is covered.
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 5000; i++) big.append('x');
        String payload = "{\"data\":\"" + big + "\"}";
        server.respondWith(200, payload);
        assertEquals(payload, HttpJson.request("GET", server.url("/big"), "t", null));
    }

    @Test
    public void connectionRefusedSurfacesAsIOException() throws Exception {
        // Points at a port nothing listens on: exercises the openConnection/connect failure path.
        int freePort;
        try (ServerSocket probe = new ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))) {
            freePort = probe.getLocalPort();
        }
        try {
            HttpJson.request("GET", "http://127.0.0.1:" + freePort + "/x", "t", null);
            org.junit.Assert.fail("expected IOException when nothing is listening");
        } catch (IOException expected) {
            // expected
        }
    }
}
