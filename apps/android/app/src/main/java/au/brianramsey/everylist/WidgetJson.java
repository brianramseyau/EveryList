package au.brianramsey.everylist;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** JSON parsing between the API's `{ data: ... }` envelope and the widget's models, plus the
 *  snapshot serialization persisted for the offline fallback. Pure (no Android deps) so it runs
 *  under plain JUnit on the JVM. */
final class WidgetJson {

    private WidgetJson() {}

    /** Parses `GET /api/v1/lists`. */
    static List<WidgetModels.WidgetList> parseLists(String body) throws JSONException {
        JSONArray data = new JSONObject(body).optJSONArray("data");
        List<WidgetModels.WidgetList> out = new ArrayList<>();
        if (data == null) return out;
        for (int i = 0; i < data.length(); i++) {
            JSONObject o = data.getJSONObject(i);
            out.add(new WidgetModels.WidgetList(o.optLong("id", 0L), o.optString("name", "")));
        }
        return out;
    }

    /** Parses `GET /api/v1/lists/:id/items`. */
    static List<WidgetModels.WidgetItem> parseItems(String body) throws JSONException {
        JSONArray data = new JSONObject(body).optJSONArray("data");
        List<WidgetModels.WidgetItem> out = new ArrayList<>();
        if (data == null) return out;
        for (int i = 0; i < data.length(); i++) {
            out.add(parseItem(data.getJSONObject(i)));
        }
        return out;
    }

    static WidgetModels.WidgetItem parseItem(JSONObject o) throws JSONException {
        return new WidgetModels.WidgetItem(
            o.optLong("id", 0L),
            o.optLong("listId", 0L),
            o.optString("name", ""),
            o.optBoolean("checked"),
            o.optLong("sortOrder", 0L),
            o.isNull("quantity") ? null : o.optString("quantity"),
            o.isNull("price") ? null : o.optLong("price"),
            !o.isNull("deletedAt"));
    }

    /** Serializes a snapshot of non-deleted items for `WidgetPrefs` storage. */
    static String itemsToJson(List<WidgetModels.WidgetItem> items) throws JSONException {
        JSONArray arr = new JSONArray();
        for (WidgetModels.WidgetItem it : items) {
            JSONObject o = new JSONObject();
            o.put("id", it.id);
            o.put("listId", it.listId);
            o.put("name", it.name);
            o.put("checked", it.checked);
            o.put("sortOrder", it.sortOrder);
            if (it.quantity != null) o.put("quantity", it.quantity);
            if (it.price != null) o.put("price", it.price);
            o.put("deleted", it.deleted);
            arr.put(o);
        }
        return arr.toString();
    }

    /** Restores a snapshot previously written by {@link #itemsToJson}. */
    static List<WidgetModels.WidgetItem> itemsFromJson(String json) throws JSONException {
        JSONArray arr = new JSONArray(json);
        List<WidgetModels.WidgetItem> out = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            out.add(new WidgetModels.WidgetItem(
                o.optLong("id", 0L),
                o.optLong("listId", 0L),
                o.optString("name", ""),
                o.optBoolean("checked"),
                o.optLong("sortOrder", 0L),
                o.isNull("quantity") ? null : o.optString("quantity"),
                o.isNull("price") ? null : o.optLong("price"),
                o.optBoolean("deleted")));
        }
        return out;
    }
}