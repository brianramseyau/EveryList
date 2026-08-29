package au.brianramsey.everylist;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Minimal HTTP client for the widget's API calls, authenticated with the widget's Personal
 *  Access Token (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). No external HTTP library — `HttpURLConnection` keeps the
 *  dependency surface at zero. All methods are blocking; callers must run them off the main
 *  thread. */
final class WidgetApiClient {

    private static final int TIMEOUT_MS = 10000;

    private WidgetApiClient() {}

    /** `GET /api/v1/lists` — the list selector's data. */
    static List<WidgetModels.WidgetList> fetchLists(String token, String serverUrl) throws IOException {
        String body = request("GET", serverUrl + "/api/v1/lists", token, null);
        try {
            return WidgetJson.parseLists(body);
        } catch (Exception e) {
            throw new IOException("Malformed lists response", e);
        }
    }

    /** `GET /api/v1/lists/:id/items` — the rows. */
    static List<WidgetModels.WidgetItem> fetchItems(String token, String serverUrl, long listId) throws IOException {
        String body = request("GET", serverUrl + "/api/v1/lists/" + listId + "/items", token, null);
        try {
            return WidgetJson.parseItems(body);
        } catch (Exception e) {
            throw new IOException("Malformed items response", e);
        }
    }

    /** `POST /api/v1/lists/:id/items` with `{ name }` — the quick-add popup's only field. */
    static void createItem(String token, String serverUrl, long listId, String name) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("name", name);
        } catch (org.json.JSONException e) {
            // Unreachable for a string value; keep the method's IOException-only surface.
            throw new IOException("Failed to build create-item payload", e);
        }
        request("POST", serverUrl + "/api/v1/lists/" + listId + "/items", token, body.toString());
    }

    /** `PATCH /api/v1/lists/:id/items/:itemId` with `{ checked }` — the checkbox toggle. */
    static void toggleItem(String token, String serverUrl, long listId, long itemId, boolean checked) throws IOException {
        JSONObject body = new JSONObject();
        try {
            body.put("checked", checked);
        } catch (org.json.JSONException e) {
            // Unreachable for a boolean value; keep the method's IOException-only surface.
            throw new IOException("Failed to build toggle payload", e);
        }
        request("PATCH", serverUrl + "/api/v1/lists/" + listId + "/items/" + itemId, token,
            body.toString());
    }

    private static String request(String method, String url, String token, String jsonBody) throws IOException {
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