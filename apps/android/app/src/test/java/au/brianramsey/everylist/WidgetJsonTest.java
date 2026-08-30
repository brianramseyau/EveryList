package au.brianramsey.everylist;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.List;

/** Unit tests for the widget's pure JSON parsing (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md) — the pieces that
 *  don't need the Android framework, run on the JVM via `./gradlew test`. Ordering/clustering is no
 *  longer client-side logic (`GET /api/v1/lists/:id/widget-snapshot` does it server-side, sharing
 *  the API's `buildFlatDisplayOrder`), so these are now just field-mapping tests. */
public class WidgetJsonTest {

    @Test
    public void parseLists_readsDataEnvelope() throws Exception {
        String body = "{\"data\":[{\"id\":1,\"name\":\"Groceries\"},{\"id\":7,\"name\":\"Hardware\"}]}";
        List<WidgetModels.WidgetList> lists = WidgetJson.parseLists(body);
        assertEquals(2, lists.size());
        assertEquals(1, lists.get(0).id);
        assertEquals("Groceries", lists.get(0).name);
        assertEquals(7, lists.get(1).id);
        assertEquals("Hardware", lists.get(1).name);
    }

    @Test
    public void parseLists_emptyData() throws Exception {
        assertEquals(0, WidgetJson.parseLists("{\"data\":[]}").size());
    }

    @Test
    public void parseWidgetSnapshot_readsListNameAndItems() throws Exception {
        String body = "{\"data\":{\"listName\":\"Groceries\",\"items\":["
            + "{\"id\":2,\"name\":\"Milk\",\"quantity\":\"1 gal\",\"checked\":false},"
            + "{\"id\":3,\"name\":\"Bread\",\"quantity\":null,\"checked\":true}"
            + "]}}";
        WidgetModels.WidgetSnapshot snapshot = WidgetJson.parseWidgetSnapshot(body);
        assertEquals("Groceries", snapshot.listName);
        assertEquals(2, snapshot.items.size());

        WidgetModels.WidgetItem milk = snapshot.items.get(0);
        assertEquals(2, milk.id);
        assertEquals("Milk", milk.name);
        assertEquals("1 gal", milk.quantity);
        assertFalse(milk.checked);

        WidgetModels.WidgetItem bread = snapshot.items.get(1);
        assertEquals("Bread", bread.name);
        assertNull(bread.quantity);
        assertTrue(bread.checked);
    }

    @Test
    public void parseWidgetSnapshot_missingDataYieldsEmptySnapshot() throws Exception {
        WidgetModels.WidgetSnapshot snapshot = WidgetJson.parseWidgetSnapshot("{}");
        assertEquals("", snapshot.listName);
        assertEquals(0, snapshot.items.size());
    }

    @Test
    public void snapshotRoundTrips() throws Exception {
        String body = "{\"data\":{\"listName\":\"Groceries\",\"items\":["
            + "{\"id\":2,\"name\":\"Milk\",\"quantity\":\"1 gal\",\"checked\":true}]}}";
        List<WidgetModels.WidgetItem> original = WidgetJson.parseWidgetSnapshot(body).items;

        String json = WidgetJson.itemsToJson(original);
        List<WidgetModels.WidgetItem> restored = WidgetJson.itemsFromJson(json);
        assertEquals(1, restored.size());
        WidgetModels.WidgetItem item = restored.get(0);
        assertEquals(2, item.id);
        assertEquals("Milk", item.name);
        assertEquals("1 gal", item.quantity);
        assertTrue(item.checked);
    }

    @Test
    public void snapshotRoundTrips_nullQuantity() throws Exception {
        List<WidgetModels.WidgetItem> original = List.of(
            new WidgetModels.WidgetItem(5, "Batteries", false, null));
        List<WidgetModels.WidgetItem> restored = WidgetJson.itemsFromJson(WidgetJson.itemsToJson(original));
        assertEquals(1, restored.size());
        assertNull(restored.get(0).quantity);
    }
}
