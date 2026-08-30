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

    /** Parses `GET /api/v1/lists/:id/widget-snapshot` — already filtered and ordered server-side,
     *  so there's no client-side sorting/grouping logic left to test here beyond field mapping. */
    static WidgetModels.WidgetSnapshot parseWidgetSnapshot(String body) throws JSONException {
        JSONObject data = new JSONObject(body).optJSONObject("data");
        if (data == null) return new WidgetModels.WidgetSnapshot("", new ArrayList<>());

        String listName = data.optString("listName", "");
        JSONArray itemsJson = data.optJSONArray("items");
        List<WidgetModels.WidgetItem> items = new ArrayList<>();
        if (itemsJson != null) {
            for (int i = 0; i < itemsJson.length(); i++) {
                JSONObject o = itemsJson.getJSONObject(i);
                items.add(new WidgetModels.WidgetItem(
                    o.optLong("id", 0L),
                    o.optString("name", ""),
                    o.optBoolean("checked"),
                    o.isNull("quantity") ? null : o.optString("quantity")));
            }
        }
        return new WidgetModels.WidgetSnapshot(listName, items);
    }

    /** Serializes a snapshot's items for `WidgetPrefs` storage — already filtered/ordered, so this
     *  just round-trips the fields the offline fallback needs to render. */
    static String itemsToJson(List<WidgetModels.WidgetItem> items) throws JSONException {
        JSONArray arr = new JSONArray();
        for (WidgetModels.WidgetItem it : items) {
            JSONObject o = new JSONObject();
            o.put("id", it.id);
            o.put("name", it.name);
            o.put("checked", it.checked);
            if (it.quantity != null) o.put("quantity", it.quantity);
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
                o.optString("name", ""),
                o.optBoolean("checked"),
                o.isNull("quantity") ? null : o.optString("quantity")));
        }
        return out;
    }
}
