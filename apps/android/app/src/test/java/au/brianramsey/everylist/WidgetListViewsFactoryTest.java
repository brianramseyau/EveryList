package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;

import java.util.Arrays;
import java.util.Collections;

/**
 * Unit tests for {@link WidgetListViewsFactory} and {@link WidgetListService} — the widget's
 * ListView rows, built from the per-widget snapshot. Each returned {@link android.widget.RemoteViews}
 * is applied to a real (Robolectric) view hierarchy so the row's actual text/visibility can be
 * asserted.
 */
@RunWith(RobolectricTestRunner.class)
public class WidgetListViewsFactoryTest {

    private static final int WIDGET_ID = 55;

    private Context context;
    private WidgetPrefs prefs;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("widget_" + WIDGET_ID, Context.MODE_PRIVATE).edit().clear().commit();
        prefs = new WidgetPrefs(context, WIDGET_ID);
        prefs.setListId(74L);
    }

    private View render(int position) {
        WidgetListViewsFactory factory = new WidgetListViewsFactory(context, WIDGET_ID);
        factory.onDataSetChanged();
        return factory.getViewAt(position).apply(context, new FrameLayout(context));
    }

    @Test
    public void serviceCreatesAFactoryForKeyedByWidgetId() {
        Intent intent = new Intent(context, WidgetListService.class)
            .putExtra(EveryListWidget.EXTRA_APPWIDGET_ID, WIDGET_ID);
        WidgetListService service = Robolectric.buildService(WidgetListService.class).create().get();
        assertNotNull(service.onGetViewFactory(intent));
    }

    @Test
    public void rendersOpenItemNameAndHidesQuantityWhenUnset() {
        prefs.setShowCompleted(true);
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, null)));

        View row = render(0);

        assertEquals("Milk", ((TextView) row.findViewById(R.id.item_name)).getText().toString());
        assertEquals(View.GONE, row.findViewById(R.id.item_sub).getVisibility());
        assertEquals(View.GONE, row.findViewById(R.id.item_deadline_row).getVisibility());
    }

    @Test
    public void rendersQuantityWhenPresent() {
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, "1 gal", null)));

        View row = render(0);

        assertEquals(View.VISIBLE, row.findViewById(R.id.item_sub).getVisibility());
        assertEquals("1 gal", ((TextView) row.findViewById(R.id.item_sub)).getText().toString());
    }

    @Test
    public void rendersADeadlineChipOnlyWhenTheListUsesDeadlines() {
        prefs.setUseDeadline(true);
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, "2099-01-01")));

        View row = render(0);

        assertEquals(View.VISIBLE, row.findViewById(R.id.item_deadline_row).getVisibility());
        assertTrue(((TextView) row.findViewById(R.id.item_deadline)).getText().length() > 0);
    }

    @Test
    public void hidesTheDeadlineChipWhenTheListDoesNotUseDeadlines() {
        prefs.setUseDeadline(false);
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, "2099-01-01")));

        View row = render(0);

        assertEquals(View.GONE, row.findViewById(R.id.item_deadline_row).getVisibility());
    }

    @Test
    public void rendersAnOverdueDeadlineChip() {
        prefs.setUseDeadline(true);
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, "2000-01-01")));
        View row = render(0);
        assertEquals(View.VISIBLE, row.findViewById(R.id.item_deadline_row).getVisibility());
        assertTrue(((TextView) row.findViewById(R.id.item_deadline)).getText().toString().startsWith("Overdue"));
    }

    @Test
    public void anEmptyQuantityIsTreatedAsUnset() {
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, "", null)));
        View row = render(0);
        assertEquals(View.GONE, row.findViewById(R.id.item_sub).getVisibility());
    }

    @Test
    public void checkedItemsCarryAContentDescriptionAndStrikethrough() {
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", true, null, null)));

        View row = render(0);

        // Checked and unchecked both carry a description, so assert the specific one, and the
        // strikethrough (STRIKE_THRU_TEXT_FLAG) that distinguishes a checked row.
        assertEquals(context.getString(R.string.widget_item_checked),
            row.findViewById(R.id.item_check).getContentDescription());
        TextView name = row.findViewById(R.id.item_name);
        assertTrue("a checked row's name should be struck through",
            (name.getPaintFlags() & android.graphics.Paint.STRIKE_THRU_TEXT_FLAG) != 0);
    }

    @Test
    public void uncheckedItemsHaveNoStrikethrough() {
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, null)));

        View row = render(0);

        assertEquals(context.getString(R.string.widget_item_unchecked),
            row.findViewById(R.id.item_check).getContentDescription());
        TextView name = row.findViewById(R.id.item_name);
        assertEquals("an unchecked row's name must not be struck through",
            0, name.getPaintFlags() & android.graphics.Paint.STRIKE_THRU_TEXT_FLAG);
    }

    @Test
    public void dateOnlyAndNoDeadlineRowsRenderWithoutAChip() {
        // A row with a deadline but the list toggled off, and one with none at all, both hide it.
        prefs.setUseDeadline(false);
        prefs.saveSnapshot(Arrays.asList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, "2099-01-01"),
            new WidgetModels.WidgetItem(2, "Bread", false, null, null)));
        assertEquals(View.GONE, render(0).findViewById(R.id.item_deadline_row).getVisibility());
        assertEquals(View.GONE, render(1).findViewById(R.id.item_deadline_row).getVisibility());
    }

    @Test
    public void getCountAndItemIdTrackTheSnapshot() {
        prefs.saveSnapshot(Arrays.asList(
            new WidgetModels.WidgetItem(11, "A", false, null, null),
            new WidgetModels.WidgetItem(22, "B", false, null, null)));

        WidgetListViewsFactory factory = new WidgetListViewsFactory(context, WIDGET_ID);
        factory.onDataSetChanged();

        assertEquals(2, factory.getCount());
        assertEquals(11L, factory.getItemId(0));
        assertEquals(22L, factory.getItemId(1));
        assertTrue(factory.hasStableIds());
        assertEquals(1, factory.getViewTypeCount());
        assertNull(factory.getLoadingView());
    }

    @Test
    public void onDestroyClearsTheRows() {
        prefs.saveSnapshot(Collections.singletonList(
            new WidgetModels.WidgetItem(1, "Milk", false, null, null)));
        WidgetListViewsFactory factory = new WidgetListViewsFactory(context, WIDGET_ID);
        factory.onDataSetChanged();
        factory.onDestroy();
        assertEquals(0, factory.getCount());
    }
}
