package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Unit tests for {@link WidgetUpdater}'s pure decision helpers — the optimistic-toggle filter and
 * the retry backoff — extracted to package-private statics so they're reachable without the
 * Android framework the rest of the class needs.
 */
public class WidgetUpdaterLogicTest {

    private static WidgetModels.WidgetItem item(long id, String name, boolean checked) {
        return new WidgetModels.WidgetItem(id, name, checked, null, null);
    }

    // --- applyOptimisticToggle ---

    @Test
    public void checkingAnItemHidesItWhenCompletedItemsAreHidden() {
        List<WidgetModels.WidgetItem> snapshot = Arrays.asList(item(1, "Milk", false), item(2, "Bread", false));
        List<WidgetModels.WidgetItem> updated = WidgetUpdater.applyOptimisticToggle(snapshot, 1L, true, false);
        assertEquals(1, updated.size());
        assertEquals("Bread", updated.get(0).name);
    }

    @Test
    public void checkingAnItemKeepsItVisibleWhenCompletedItemsAreShown() {
        List<WidgetModels.WidgetItem> snapshot = Collections.singletonList(item(1, "Milk", false));
        List<WidgetModels.WidgetItem> updated = WidgetUpdater.applyOptimisticToggle(snapshot, 1L, true, true);
        assertEquals(1, updated.size());
        assertEquals(true, updated.get(0).checked);
    }

    @Test
    public void uncheckingAnItemKeepsItAndClearsTheFlag() {
        List<WidgetModels.WidgetItem> snapshot = Collections.singletonList(item(1, "Milk", true));
        List<WidgetModels.WidgetItem> updated = WidgetUpdater.applyOptimisticToggle(snapshot, 1L, false, false);
        assertEquals(1, updated.size());
        assertEquals(false, updated.get(0).checked);
    }

    @Test
    public void untouchedItemsArePreservedInOrder() {
        List<WidgetModels.WidgetItem> snapshot = Arrays.asList(item(1, "A", false), item(2, "B", false));
        List<WidgetModels.WidgetItem> updated = WidgetUpdater.applyOptimisticToggle(snapshot, 1L, false, false);
        assertEquals(2, updated.size());
        assertEquals("A", updated.get(0).name);
        assertEquals("B", updated.get(1).name);
    }

    @Test
    public void unknownItemLeavesTheSnapshotUnchanged() {
        List<WidgetModels.WidgetItem> snapshot = Collections.singletonList(item(1, "Milk", false));
        List<WidgetModels.WidgetItem> updated = WidgetUpdater.applyOptimisticToggle(snapshot, 999L, true, false);
        assertEquals(1, updated.size());
        assertEquals("Milk", updated.get(0).name);
    }

    // --- retryDelayMs ---

    @Test
    public void retryDelayDoublesFromThirtySeconds() {
        assertEquals(30_000L, WidgetUpdater.retryDelayMs(1));
        assertEquals(60_000L, WidgetUpdater.retryDelayMs(2));
        assertEquals(120_000L, WidgetUpdater.retryDelayMs(3));
        assertEquals(240_000L, WidgetUpdater.retryDelayMs(4));
    }

    @Test
    public void retryDelayIsCappedAtSixteenMinutes() {
        // 30s << 5 = 960s (16 min) is the cap; further attempts stay there.
        assertEquals(16 * 60 * 1000L, WidgetUpdater.retryDelayMs(6));
        assertEquals(16 * 60 * 1000L, WidgetUpdater.retryDelayMs(7));
    }
}
