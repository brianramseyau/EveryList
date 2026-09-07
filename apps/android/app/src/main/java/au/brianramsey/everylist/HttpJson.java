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
 *  methods are blocking; callers must run them off the main thread. */
final class HttpJson {

    private static final int TIMEOUT_MS = 10000;

    private HttpJson() {}

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
