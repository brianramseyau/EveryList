package au.brianramsey.everylist;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Minimal blocking JSON-over-HTTP helper shared by {@link WidgetApiClient} (the widget's PAT-
 *  authenticated calls) and {@link DeadlineNotificationActionReceiver} (the deadline-notification
 *  Complete/Snooze actions, authenticated with the app's own mirrored session token) — both need
 *  the exact same bearer-token request/response plumbing with no external HTTP library. All
 *  methods are blocking; callers must run them off the main thread.
 *
 *  <p>Production code reaches the network through {@link #send}, which delegates to a swappable
 *  {@link Transport} (default {@link #request}). Tests replace the transport to make every caller
 *  deterministic without a socket — and, crucially, to exercise the PATCH calls the JDK's own
 *  {@code HttpURLConnection} refuses outright ("Invalid HTTP method"), which is why
 *  {@link WidgetApiClient#updateItemDeadline}/{@link WidgetApiClient#toggleItem} had no JVM test
 *  before. The swap is the same {@code …ForTesting} pattern as
 *  {@code sync_broadcaster.setSyncBroadcasterForTesting} in apps/api. */
final class HttpJson {

    private static final int TIMEOUT_MS = 10000;

    /** One HTTP round trip. The default implementation is {@link #request}. */
    interface Transport {
        String request(String method, String url, String token, String jsonBody) throws IOException;
    }

    private static final Transport DEFAULT_TRANSPORT = HttpJson::request;
    private static volatile Transport transport = DEFAULT_TRANSPORT;

    private HttpJson() {}

    /** The production entry point every caller uses. */
    static String send(String method, String url, String token, String jsonBody) throws IOException {
        return transport.request(method, url, token, jsonBody);
    }

    /** Replaces the transport for the duration of a test. Always pair with
     *  {@link #resetTransportForTesting} in an {@code @After}. */
    static void setTransportForTesting(Transport replacement) {
        transport = replacement;
    }

    static void resetTransportForTesting() {
        transport = DEFAULT_TRANSPORT;
    }

    /** The real network implementation. Package-visible so {@link HttpJsonTest} can drive it
     *  directly against {@link MiniHttpServer}. */
    static String request(String method, String url, String token, String jsonBody) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("Accept", "application/json");
        if (jsonBody != null) {
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            byte[] bytes = jsonBody.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(bytes);
            }
        }

        int code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            conn.disconnect();
            throw new IOException("API returned " + code);
        }
        String body;
        try (java.io.InputStream in = conn.getInputStream()) {
            body = new String(readAll(in), StandardCharsets.UTF_8);
        } finally {
            conn.disconnect();
        }
        return body;
    }

    private static byte[] readAll(java.io.InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }
}
