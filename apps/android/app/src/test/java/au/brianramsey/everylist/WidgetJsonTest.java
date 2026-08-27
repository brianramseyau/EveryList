package au.brianramsey.everylist;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.List;

/** Unit tests for the pure JSON + data logic of the widget (PHASE18_PLAN.md) — the pieces that
 *  don't need the Android framework, run on the JVM via `./gradlew test`. */
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
    public void parseItems_readsCheckedAndSortOrder() throws Exception {
        String body = "{\"data\":["
            + "{\"id\":2,\"listId\":1,\"name\":\"Milk\",\"quantity\":\"1 gal\",\"price\":299,"
            + "\"checked\":false,\"sortOrder\":10,\"deletedAt\":null},"
            + "{\"id\":3,\"listId\":1,\"name\":\"Bread\",\"quantity\":null,\"price\":null,"
            + "\"checked\":true,\"sortOrder\":20,\"deletedAt\":null}"
            + "]}";
        List<WidgetModels.WidgetItem> items = WidgetJson.parseItems(body);
        assertEquals(2, items.size());
        WidgetModels.WidgetItem milk = items.get(0);
        assertEquals(2, milk.id);
        assertEquals(1, milk.listId);
        assertEquals("Milk", milk.name);
        assertEquals("1 gal", milk.quantity);
        assertEquals(Long.valueOf(299L), milk.price);
        assertFalse(milk.checked);
        assertEquals(10L, milk.sortOrder);
        assertFalse(milk.deleted);

        WidgetModels.WidgetItem bread = items.get(1);
        assertTrue(bread.checked);
        assertNull(bread.quantity);
        assertNull(bread.price);
    }

    @Test
    public void parseItems_flagsSoftDeletedRows() throws Exception {
        String body = "{\"data\":[{\"id\":4,\"listId\":1,\"name\":\"Old\",\"checked\":false,"
            + "\"sortOrder\":1,\"deletedAt\":\"2026-08-01T00:00:00.000Z\"}]}";
        List<WidgetModels.WidgetItem> items = WidgetJson.parseItems(body);
        assertTrue(items.get(0).deleted);
    }

    @Test
    public void snapshotRoundTrips() throws Exception {
        List<WidgetModels.WidgetItem> original = WidgetJson.parseItems("{\"data\":["
            + "{\"id\":2,\"listId\":1,\"name\":\"Milk\",\"quantity\":\"1 gal\",\"price\":299,"
            + "\"checked\":true,\"sortOrder\":5,\"deletedAt\":null}]}");
        String json = WidgetJson.itemsToJson(original);
        List<WidgetModels.WidgetItem> restored = WidgetJson.itemsFromJson(json);
        assertEquals(1, restored.size());
        WidgetModels.WidgetItem item = restored.get(0);
        assertEquals(2, item.id);
        assertEquals("Milk", item.name);
        assertEquals("1 gal", item.quantity);
        assertEquals(Long.valueOf(299L), item.price);
        assertTrue(item.checked);
        assertFalse(item.deleted);
    }

    @Test
    public void filter_dropsDeletedAndHidesCheckedWhenNotShown() {
        List<WidgetModels.WidgetItem> items = List.of(
            new WidgetModels.WidgetItem(1, 1, "A", true, 30, null, null, false),
            new WidgetModels.WidgetItem(2, 1, "B", false, 10, null, null, false),
            new WidgetModels.WidgetItem(3, 1, "C", false, 20, null, null, true));
        List<WidgetModels.WidgetItem> hidden = WidgetData.filter(items, false);
        assertEquals(1, hidden.size());
        assertEquals(2, hidden.get(0).id);

        List<WidgetModels.WidgetItem> shown = WidgetData.filter(items, true);
        assertEquals(2, shown.size());
        // Deleted dropped, remaining sorted by sortOrder.
        assertEquals(2, shown.get(0).id);
        assertEquals(1, shown.get(1).id);
    }
}