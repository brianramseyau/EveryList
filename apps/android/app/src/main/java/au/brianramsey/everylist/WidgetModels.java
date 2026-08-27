package au.brianramsey.everylist;

/** Plain data holders for the widget's view of the API (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). Kept separate from the
 *  JSON layer so the parsing/filtering logic is unit-testable on the JVM. */
final class WidgetModels {

    private WidgetModels() {}

    /** A list as returned by `GET /api/v1/lists`. */
    static final class WidgetList {
        final long id;
        final String name;

        WidgetList(long id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    /** An item as returned by `GET /api/v1/lists/:id/items` — the fields the widget renders. */
    static final class WidgetItem {
        final long id;
        final long listId;
        final String name;
        final boolean checked;
        final long sortOrder;
        final String quantity;
        final Long price;
        final boolean deleted;

        WidgetItem(long id, long listId, String name, boolean checked, long sortOrder,
                   String quantity, Long price, boolean deleted) {
            this.id = id;
            this.listId = listId;
            this.name = name;
            this.checked = checked;
            this.sortOrder = sortOrder;
            this.quantity = quantity;
            this.price = price;
            this.deleted = deleted;
        }
    }
}