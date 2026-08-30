package au.brianramsey.everylist;

import java.util.List;

/** Plain data holders for the widget's view of the API (PLAN_18_PHASE_ANDROID_HOME_SCREEN_WIDGET.md). Kept separate from the
 *  parsing layer so it's unit-testable on the JVM. */
final class WidgetModels {

    private WidgetModels() {}

    /** A list as returned by `GET /api/v1/lists` — just enough for the list picker. */
    static final class WidgetList {
        final long id;
        final String name;

        WidgetList(long id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    /** A row as returned by `GET /api/v1/lists/:id/widget-snapshot` — already filtered
     *  (show/hide-completed) and ordered (category-clustered, ranked-or-alphabetical) by the
     *  server, so the widget only has to render it. */
    static final class WidgetItem {
        final long id;
        final String name;
        final boolean checked;
        final String quantity;

        WidgetItem(long id, String name, boolean checked, String quantity) {
            this.id = id;
            this.name = name;
            this.checked = checked;
            this.quantity = quantity;
        }
    }

    /** `GET /api/v1/lists/:id/widget-snapshot`'s response. */
    static final class WidgetSnapshot {
        final String listName;
        final List<WidgetItem> items;

        WidgetSnapshot(String listName, List<WidgetItem> items) {
            this.listName = listName;
            this.items = items;
        }
    }
}
