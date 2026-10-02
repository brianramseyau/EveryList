package au.brianramsey.everylist;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * A recording {@link HttpJson.Transport} for JVM tests — captures each request and returns a
 * caller-supplied response (or throws), without touching a socket. Complements
 * {@link MiniHttpServer} (which exercises the real {@code HttpURLConnection} path): this one is
 * for callers whose method the JDK's own connection refuses (PATCH) and for verifying the exact
 * payloads a class puts on the wire.
 */
final class RecordingTransport implements HttpJson.Transport {

    static final class Call {
        final String method;
        final String url;
        final String token;
        final String body;

        Call(String method, String url, String token, String body) {
            this.method = method;
            this.url = url;
            this.token = token;
            this.body = body;
        }
    }

    final List<Call> calls = new ArrayList<>();
    /** Response body returned for a successful call. Ignored when {@link #failure} is set. */
    String response = "{}";
    /** When non-null, {@link #request} throws this instead of returning {@link #response}. */
    IOException failure;

    @Override
    public String request(String method, String url, String token, String jsonBody) throws IOException {
        calls.add(new Call(method, url, token, jsonBody));
        if (failure != null) throw failure;
        return response;
    }

    Call last() {
        return calls.get(calls.size() - 1);
    }
}
