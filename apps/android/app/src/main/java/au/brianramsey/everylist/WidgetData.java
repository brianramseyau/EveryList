package au.brianramsey.everylist;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Pure filtering/sorting of the widget's item snapshot — the shared logic used by both the
 *  refresh path (service) and the render path (ListView factory) so they can't disagree. */
final class WidgetData {

    private WidgetData() {}

    /** Drops soft-deleted items, hides checked items when completed aren't shown, and orders by
     *  `sortOrder` ascending (the app's display order). */
    static List<WidgetModels.WidgetItem> filter(List<WidgetModels.WidgetItem> items, boolean showCompleted) {
        List<WidgetModels.WidgetItem> out = new ArrayList<>();
        for (WidgetModels.WidgetItem it : items) {
            if (it.deleted) continue;
            if (!showCompleted && it.checked) continue;
            out.add(it);
        }
        out.sort(Comparator.comparingLong(a -> a.sortOrder));
        return out;
    }
}