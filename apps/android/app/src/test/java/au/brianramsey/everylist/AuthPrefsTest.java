package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * Unit tests for {@link AuthPrefs} — the native mirror of the app's session token + server URL,
 * read by {@link DeadlineNotificationActionReceiver} so it can authenticate without a WebView.
 * Runs under Robolectric so the real {@code SharedPreferences} implementation is exercised on the
 * JVM (no emulator).
 */
@RunWith(RobolectricTestRunner.class)
public class AuthPrefsTest {

    private Context context;

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        AuthPrefs.clear(context);
    }

    @Test
    public void saveThenReadRoundTripsBothValues() {
        AuthPrefs.save(context, "sess_token", "http://10.0.2.2:3334");
        assertEquals("sess_token", AuthPrefs.getToken(context));
        assertEquals("http://10.0.2.2:3334", AuthPrefs.getServerUrl(context));
    }

    @Test
    public void readsAreNullWhenNothingHasBeenSaved() {
        assertNull(AuthPrefs.getToken(context));
        assertNull(AuthPrefs.getServerUrl(context));
    }

    @Test
    public void clearRemovesBothValues() {
        AuthPrefs.save(context, "sess_token", "http://10.0.2.2:3334");
        AuthPrefs.clear(context);
        assertNull(AuthPrefs.getToken(context));
        assertNull(AuthPrefs.getServerUrl(context));
    }

    @Test
    public void saveOverwritesAPreviousToken() {
        AuthPrefs.save(context, "old", "http://old");
        AuthPrefs.save(context, "new", "http://new");
        assertEquals("new", AuthPrefs.getToken(context));
        assertEquals("http://new", AuthPrefs.getServerUrl(context));
    }
}
