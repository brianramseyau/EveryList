package au.brianramsey.everylist;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.List;

/** The app→widget handoff parsed from the `everylist://widget-config` deep link
 *  (PHASE18_PLAN.md). Pure java.net so it's unit-testable on the JVM without the Android
 *  framework's Uri class. */
final class WidgetConfigPayload {

    final String token;
    final List<Long> listIds;
    final String serverUrl;

    WidgetConfigPayload(String token, List<Long> listIds, String serverUrl) {
        this.token = token;
        this.listIds = listIds;
        this.serverUrl = serverUrl;
    }

    /**
     * Parses `everylist://widget-config?token=elt_...&serverUrl=...&listIds=1,2` (the web app
     * URL-encodes each value via URLSearchParams, so every value must be percent-decoded).
     * Returns {@code null} when the URI isn't a well-formed widget-config handoff.
     */
    static WidgetConfigPayload parse(String uri) {
        if (uri == null) return null;
        try {
            URI parsed = new URI(uri);
            if (!"everylist".equals(parsed.getScheme())) return null;
            if (!"widget-config".equals(parsed.getHost())) return null;
            String query = parsed.getQuery();
            if (query == null) return null;

            String token = null;
            String serverUrl = null;
            List<Long> listIds = new ArrayList<>();
            for (String part : query.split("&")) {
                int eq = part.indexOf('=');
                if (eq < 0) continue;
                String key = part.substring(0, eq);
                String value = decode(part.substring(eq + 1));
                switch (key) {
                    case "token":
                        token = value;
                        break;
                    case "serverUrl":
                        serverUrl = value;
                        break;
                    case "listIds":
                        for (String s : value.split(",")) {
                            String trimmed = s.trim();
                            if (!trimmed.isEmpty()) listIds.add(Long.parseLong(trimmed));
                        }
                        break;
                    default:
                        break;
                }
            }
            if (token == null || token.isEmpty()) return null;
            if (serverUrl == null || serverUrl.isEmpty()) return null;
            if (listIds.isEmpty()) return null;
            return new WidgetConfigPayload(token, listIds, serverUrl);
        } catch (Exception e) {
            return null;
        }
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, "UTF-8");
        } catch (UnsupportedEncodingException e) {
            // UTF-8 is always available — unreachable in practice.
            return value;
        }
    }
}