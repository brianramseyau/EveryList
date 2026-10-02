package au.brianramsey.everylist;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * Unit tests for {@link MainActivity#spaFallbackPath} — the one decision the Capacitor
 * {@code RouteProcessor} makes. Pulled out of {@code setSpaFallbackRoute} precisely so it can be
 * tested without a live Capacitor bridge (a {@code ProcessedRoute} needs one).
 *
 * <p>The load-bearing rule: only the literal "/index.html" (how Capacitor signals the SPA-fallback
 * branch) is remapped to this project's 200.html; every real asset path must pass through
 * unchanged, or every .js/.css load would get 200.html back instead.
 */
public class MainActivityTest {

    @Test
    public void remapsOnlyTheSpaFallbackLiteralTo200Html() {
        assertEquals("/200.html", MainActivity.spaFallbackPath("", "/index.html"));
        assertEquals("/app/200.html", MainActivity.spaFallbackPath("/app", "/index.html"));
    }

    @Test
    public void passesRealAssetPathsThroughUnchanged() {
        assertEquals("/_app/immutable/entry.js",
            MainActivity.spaFallbackPath("", "/_app/immutable/entry.js"));
        assertEquals("/base/_app/immutable/entry.css",
            MainActivity.spaFallbackPath("/base", "/_app/immutable/entry.css"));
    }

    @Test
    public void passesOtherExtensionlessRoutesThroughUnchanged() {
        // A client route like /lists is not the fallback signal — Capacitor hands the real
        // request through, and the SPA shell must not be substituted for it here.
        assertEquals("/lists", MainActivity.spaFallbackPath("", "/lists"));
        assertEquals("/base/lists/74", MainActivity.spaFallbackPath("/base", "/lists/74"));
    }
}
