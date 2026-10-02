package au.brianramsey.everylist;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A recording {@link HttpJson.Transport} for JVM tests — captures each request and returns a
 * caller-supplied response (or throws), without touching a socket. Complements
 * {@link MiniHttpServer} (which exercises the real {@code HttpURLConnection} path): this one is
 * for callers whose method the JDK's own connection refuses (PATCH) and for verifying the exact
 * payloads a class puts on the wire.
 *
 * <p>Requests are recorded from whatever background thread the caller uses (the widget executor,
 * {@code RescheduleActivity}'s raw thread) and read from the test thread. Every method is
 * synchronized, so a reader never sees a partially-recorded call and gets a happens-before edge
 * with the writer rather than relying on the polling helper's sleeps.
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

    private final List<Call> calls = new ArrayList<>();
    /** Response body returned for a successful call. Ignored when {@link #failure} is set. */
    private volatile String response = "{}";
    /** When non-null, every call throws this instead of returning {@link #response}. */
    private volatile IOException failure;
    /** When > 0, only the call at this 1-based index fails (all others succeed). */
    private volatile int failOnCall = 0;
    private final AtomicInteger count = new AtomicInteger();

    synchronized List<Call> calls() {
        return Collections.unmodifiableList(new ArrayList<>(calls));
    }

    synchronized int size() {
        return calls.size();
    }

    synchronized Call get(int index) {
        return calls.get(index);
    }

    synchronized Call last() {
        return calls.get(calls.size() - 1);
    }

    synchronized void clear() {
        calls.clear();
        count.set(0);
    }

    void respondWith(String body) {
        this.response = body;
    }

    void failAlways(IOException error) {
        this.failure = error;
        this.failOnCall = 0;
    }

    void failOnCall(int oneBasedIndex, IOException error) {
        this.failure = error;
        this.failOnCall = oneBasedIndex;
    }

    void succeed() {
        this.failure = null;
        this.failOnCall = 0;
    }

    @Override
    public String request(String method, String url, String token, String jsonBody) throws IOException {
        int n = count.incrementAndGet();
        synchronized (this) {
            calls.add(new Call(method, url, token, jsonBody));
        }
        IOException failure = this.failure;
        if (failure != null && (failOnCall == 0 || failOnCall == n)) throw failure;
        return response;
    }
}
