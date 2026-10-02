package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Unit tests for {@link WidgetPrefs} — the widget's two layers of SharedPreferences: the global
 * provisioned credentials (PAT/server URL/granted list ids) and per-instance selection + offline
 * snapshot. Runs under Robolectric against the real SharedPreferences implementation, including
 * {@code Settings.Secure.ANDROID_ID} for the device-id derivation.
 */
@RunWith(RobolectricTestRunner.class)
public class WidgetPrefsTest {

    private static final int WIDGET_ID = 42;
    private static final String WIDGET_PREFS = "widget_" + WIDGET_ID;
    private static final String BROKEN_ANDROID_ID = "9774d56d682e549c";

    private Context context;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        // The real app's process keeps one prefs file per name; clear both between tests so
        // Robolectric's per-test app instance can't leak one test's credentials into another.
        context.getSharedPreferences(WidgetPrefs.GLOBAL_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    // --- Global credentials ---

    @Test
    public void saveGlobalCredentialsThenReadThemBack() {
        WidgetPrefs.saveGlobalCredentials(context, "elt_abc", 7L, "http://server:3334",
            Arrays.asList(3L, 74L));

        assertTrue(WidgetPrefs.hasGlobalCredentials(context));
        assertEquals("elt_abc", WidgetPrefs.getGlobalToken(context));
        assertEquals("http://server:3334", WidgetPrefs.getGlobalServerUrl(context));
        assertEquals(7L, WidgetPrefs.getTokenId(context));
        assertEquals(Arrays.asList(3L, 74L), WidgetPrefs.getGlobalListIds(context));
    }

    @Test
    public void noCredentialsByDefault() {
        assertFalse(WidgetPrefs.hasGlobalCredentials(context));
        assertEquals(-1L, WidgetPrefs.getTokenId(context));
        assertEquals("", WidgetPrefs.getGlobalToken(context));
        assertEquals("", WidgetPrefs.getGlobalServerUrl(context));
        assertTrue(WidgetPrefs.getGlobalListIds(context).isEmpty());
    }

    @Test
    public void getGlobalListIdsSkipsEmptyAndWhitespaceEntries() {
        SharedPreferences.Editor editor =
            context.getSharedPreferences(WidgetPrefs.GLOBAL_PREFS, Context.MODE_PRIVATE).edit();
        editor.putString("listIds", " 3 ,, 74 ,");
        editor.commit();
        assertEquals(Arrays.asList(3L, 74L), WidgetPrefs.getGlobalListIds(context));
    }

    @Test
    public void globalDefaultsRoundTrip() {
        assertFalse(WidgetPrefs.getGlobalDefaultShowCompleted(context));
        assertEquals(-1L, WidgetPrefs.getGlobalDefaultListId(context));

        WidgetPrefs.setGlobalDefaults(context, 99L, true);
        assertEquals(99L, WidgetPrefs.getGlobalDefaultListId(context));
        assertTrue(WidgetPrefs.getGlobalDefaultShowCompleted(context));
    }

    // --- Device id ---

    @Test
    public void deviceIdIsDerivedFromAndroidIdAndStableAcrossCalls() {
        Settings.Secure.putString(context.getContentResolver(), Settings.Secure.ANDROID_ID, "abcdef1234567890");
        String id = WidgetPrefs.getDeviceId(context);
        assertEquals(8, id.length());
        assertEquals("derived id must be stable within an install", id, WidgetPrefs.getDeviceId(context));
    }

    @Test
    public void deviceIdMatchesTheDocumentedHashOfPackageAndAndroidId() throws Exception {
        String androidId = "abcdef1234567890";
        Settings.Secure.putString(context.getContentResolver(), Settings.Secure.ANDROID_ID, androidId);

        byte[] digest = MessageDigest.getInstance("SHA-256")
            .digest((context.getPackageName() + ":" + androidId).getBytes(StandardCharsets.UTF_8));
        StringBuilder expected = new StringBuilder();
        for (int i = 0; i < 4; i++) expected.append(String.format("%02x", digest[i]));

        assertEquals(expected.toString(), WidgetPrefs.getDeviceId(context));
    }

    @Test
    public void brokenAndroidIdFallsBackToAnEightCharRandomId() {
        Settings.Secure.putString(context.getContentResolver(), Settings.Secure.ANDROID_ID, BROKEN_ANDROID_ID);
        String id = WidgetPrefs.getDeviceId(context);
        assertEquals(8, id.length());
        // Persisted, so it stays stable even though the underlying id is unusable.
        assertEquals(id, WidgetPrefs.getDeviceId(context));
    }

    @Test
    public void nullAndroidIdFallsBackToARandomId() {
        // Robolectric's default is the well-known broken constant, so explicitly null it out.
        Settings.Secure.putString(context.getContentResolver(), Settings.Secure.ANDROID_ID, null);
        String id = WidgetPrefs.getDeviceId(context);
        assertEquals(8, id.length());
        assertEquals(id, WidgetPrefs.getDeviceId(context));
    }

    // --- Per-instance ---

    @Test
    public void instanceDefaults() {
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        assertEquals(-1L, prefs.getListId());
        assertEquals("", prefs.getListName());
        assertFalse(prefs.getUseDeadline());
        assertFalse(prefs.getShowCompleted());
        assertEquals(0, prefs.getRetryCount());
        assertNull(prefs.getLastError());
        assertTrue(prefs.loadSnapshot().isEmpty());
        assertFalse(prefs.hasCredentials());
    }

    @Test
    public void instanceSettersRoundTrip() {
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        prefs.setListId(74L);
        prefs.setListName("TODO");
        prefs.setUseDeadline(true);
        prefs.setShowCompleted(true);
        prefs.setRetryCount(3);
        prefs.setLastError("offline");

        WidgetPrefs reread = new WidgetPrefs(context, WIDGET_ID);
        assertEquals(74L, reread.getListId());
        assertEquals("TODO", reread.getListName());
        assertTrue(reread.getUseDeadline());
        assertTrue(reread.getShowCompleted());
        assertEquals(3, reread.getRetryCount());
        assertEquals("offline", reread.getLastError());
    }

    @Test
    public void settingLastErrorToNullClearsIt() {
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        prefs.setLastError("offline");
        prefs.setLastError(null);
        assertNull(prefs.getLastError());
    }

    @Test
    public void instanceHasCredentialsMirrorsGlobal() {
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        WidgetPrefs.saveGlobalCredentials(context, "elt", 1L, "http://s", Collections.singletonList(1L));
        assertTrue(prefs.hasCredentials());
        assertEquals("elt", prefs.getToken());
        assertEquals("http://s", prefs.getServerUrl());
    }

    @Test
    public void seedFromDefaultsAppliesGlobalListAndShowCompletedWhenUnset() {
        WidgetPrefs.setGlobalDefaults(context, 99L, true);
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        prefs.seedFromDefaults(context);

        assertEquals(99L, prefs.getListId());
        assertTrue(prefs.getShowCompleted());
    }

    @Test
    public void seedFromDefaultsNeverOverwritesAnExistingSelection() {
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        prefs.setListId(5L);
        prefs.setShowCompleted(false);
        WidgetPrefs.setGlobalDefaults(context, 99L, true);

        prefs.seedFromDefaults(context);

        assertEquals(5L, prefs.getListId());
        assertFalse("an explicit per-widget choice must survive", prefs.getShowCompleted());
    }

    @Test
    public void seedFromDefaultsLeavesListAloneWhenTheGlobalDefaultIsUnset() {
        // getGlobalDefaultListId() is -1 by default; only > 0 is a real default.
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        prefs.seedFromDefaults(context);
        assertEquals(-1L, prefs.getListId());
    }

    // --- Snapshot ---

    @Test
    public void snapshotRoundTrips() {
        WidgetPrefs prefs = new WidgetPrefs(context, WIDGET_ID);
        List<WidgetModels.WidgetItem> items = Arrays.asList(
            new WidgetModels.WidgetItem(2, "Milk", false, "1 gal", "2026-09-05T14:30"),
            new WidgetModels.WidgetItem(3, "Bread", true, null, null));

        prefs.saveSnapshot(items);

        List<WidgetModels.WidgetItem> restored = new WidgetPrefs(context, WIDGET_ID).loadSnapshot();
        assertEquals(2, restored.size());
        assertEquals("Milk", restored.get(0).name);
        assertEquals("1 gal", restored.get(0).quantity);
        assertEquals("2026-09-05T14:30", restored.get(0).deadline);
        assertTrue(restored.get(1).checked);
        assertNull(restored.get(1).quantity);
    }

    @Test
    public void loadSnapshotReturnsEmptyListForCorruptStoredJson() {
        SharedPreferences.Editor editor =
            context.getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE).edit();
        editor.putString("snapshot", "not json");
        editor.commit();
        assertTrue(new WidgetPrefs(context, WIDGET_ID).loadSnapshot().isEmpty());
    }
}
