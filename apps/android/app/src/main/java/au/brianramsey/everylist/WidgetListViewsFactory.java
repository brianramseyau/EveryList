package au.brianramsey.everylist;

import android.content.Context;
import android.content.Intent;
import android.graphics.Paint;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/** Builds the widget's ListView rows from the last-fetched snapshot (the offline fallback when
 *  the server is unreachable). Each row gets two fill-in intents merged into the list's shared
 *  template (see {@link EveryListWidget#ACTION_ITEM}): tapping the row opens the item in the app,
 *  tapping the checkbox toggles completion. */
public class WidgetListViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private final Context context;
    private final int appWidgetId;
    private List<WidgetModels.WidgetItem> items = new ArrayList<>();

    WidgetListViewsFactory(Context context, int appWidgetId) {
        this.context = context;
        this.appWidgetId = appWidgetId;
    }

    @Override
    public void onCreate() {
    }

    @Override
    public void onDataSetChanged() {
        WidgetPrefs prefs = new WidgetPrefs(context, appWidgetId);
        items = WidgetData.filter(prefs.loadSnapshot(), prefs.getShowCompleted());
    }

    @Override
    public void onDestroy() {
        items.clear();
    }

    @Override
    public int getCount() {
        return items.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        WidgetModels.WidgetItem item = items.get(position);
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_everylist_item);

        row.setTextViewText(R.id.item_name, item.name);
        row.setImageViewResource(R.id.item_check,
            item.checked ? R.drawable.ic_widget_checkbox_checked : R.drawable.ic_widget_checkbox_unchecked);
        row.setContentDescription(R.id.item_check,
            context.getString(item.checked ? R.string.widget_item_checked : R.string.widget_item_unchecked));

        if (item.quantity != null && !item.quantity.isEmpty()) {
            row.setViewVisibility(R.id.item_sub, View.VISIBLE);
            row.setTextViewText(R.id.item_sub, item.quantity);
        } else {
            row.setViewVisibility(R.id.item_sub, View.GONE);
        }

        if (item.checked) {
            row.setTextColor(R.id.item_name, context.getColor(R.color.widget_checked));
            row.setInt(R.id.item_name, "setPaintFlags", Paint.STRIKE_THRU_TEXT_FLAG);
        } else {
            row.setTextColor(R.id.item_name, context.getColor(R.color.widget_ink));
            row.setInt(R.id.item_name, "setPaintFlags", 0);
        }

        Intent openFill = new Intent();
        openFill.putExtra(EveryListWidget.EXTRA_ACTION, EveryListWidget.ACTION_OPEN_ITEM);
        openFill.putExtra(EveryListWidget.EXTRA_ITEM_ID, item.id);
        openFill.putExtra(EveryListWidget.EXTRA_LIST_ID, item.listId);
        row.setOnClickFillInIntent(R.id.row_root, openFill);

        Intent toggleFill = new Intent();
        toggleFill.putExtra(EveryListWidget.EXTRA_ACTION, EveryListWidget.ACTION_TOGGLE_ITEM);
        toggleFill.putExtra(EveryListWidget.EXTRA_ITEM_ID, item.id);
        toggleFill.putExtra(EveryListWidget.EXTRA_LIST_ID, item.listId);
        row.setOnClickFillInIntent(R.id.item_check, toggleFill);

        return row;
    }

    @Override
    public RemoteViews getLoadingView() {
        return null;
    }

    @Override
    public int getViewTypeCount() {
        return 1;
    }

    @Override
    public long getItemId(int position) {
        return items.get(position).id;
    }

    @Override
    public boolean hasStableIds() {
        return true;
    }
}