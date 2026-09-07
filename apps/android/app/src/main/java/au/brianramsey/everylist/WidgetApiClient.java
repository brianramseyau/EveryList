package au.brianramsey.everylist;

import org.json.JSONObject;

import java.io.IOException;
import java.util.List;

/** Widget-specific API calls, authenticated with the widget's Personal Access Token
 *  (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). Request/response plumbing itself lives in
 *  {@link HttpJson}, shared with {@link DeadlineNotificationActionReceiver}. All methods are
 *  blocking; callers must run them off the main thread. */
final class WidgetApiClient {

    private WidgetApiClient() {}

    /** `GET /api/v1/lists` — the list selector's data. */
    static List<WidgetModels.WidgetList> fetchLists(String token, String serverUrl) throws IOException {
        String body = HttpJson.request("GET", serverUrl + "/api/v1/lists", token, null);
        try {
            return WidgetJson.parseLists(body);
        } catch (Exception e) {
            throw new IOException("Malformed lists response", e);
        }
    }

    /** `GET /api/v1/lists/:id/widget-snapshot` — the list name plus rows, already filtered
     *  (show/hide-completed) and ordered (category-clustered, ranked-or-alphabetical) server-side,
     *  matching the app's own grouped display order flattened. One round trip instead of the three
     *  (lists + items + categories) the widget used to make and then join/sort itself. */
    static WidgetModels.WidgetSnapshot fetchWidgetSnapshot(
            String token, String serverUrl, long listId, boolean includeChecked) throws IOException {
        String body = HttpJson.request("GET", serverUrl + "/api/v1/lists/" + listId
            + "/widget-snapshot?includeChecked=" + includeChecked, token, null);
        try {
            return WidgetJson.parseWidgetSnapshot(body);
        } catch (Exception e) {
            throw new IOException("Malformed widget-snapshot response", e);
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
        HttpJson.request("POST", serverUrl + "/api/v1/lists/" + listId + "/items", token, body.toString());
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
        HttpJson.request("PATCH", serverUrl + "/api/v1/lists/" + listId + "/items/" + itemId, token,
            body.toString());
    }
}