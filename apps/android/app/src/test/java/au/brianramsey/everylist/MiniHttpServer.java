package au.brianramsey.everylist;

import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * A tiny one-request-at-a-time HTTP/1.1 test double for the JVM unit tests. Hand-rolled over
 * {@link ServerSocket} because the JDK's {@code com.sun.net.httpserver.HttpServer} isn't on the
 * Android unit-test bootclasspath, and the repo stays dependency-free (no MockWebServer).
 *
 * <p>Accepts connections on an ephemeral loopback port, records each request (method, path with
 * query, headers, body), and replies with whatever {@link #respondWith} last set. Package-private
 * so {@link HttpJsonTest} (request plumbing) and {@link WidgetApiClientTest} (URL/payload shapes)
 * share one implementation.
 */
final class MiniHttpServer implements Closeable {

    final List<Recorded> requests = new ArrayList<>();
    private final ServerSocket socket;
    private final Thread thread;
    private volatile int status = 200;
    private volatile String responseBody = "";

    MiniHttpServer() throws IOException {
        socket = new ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"));
        thread = new Thread(this::serve, "mini-http");
        thread.setDaemon(true);
        thread.start();
    }

    String url(String path) {
        return "http://127.0.0.1:" + socket.getLocalPort() + path;
    }

    void respondWith(int status, String body) {
        this.status = status;
        this.responseBody = body;
    }

    private void serve() {
        while (!socket.isClosed()) {
            try (Socket client = socket.accept()) {
                Recorded r = readRequest(client.getInputStream());
                if (r == null) continue;
                synchronized (requests) {
                    requests.add(r);
                }
                writeResponse(client.getOutputStream(), status, responseBody);
            } catch (IOException e) {
                // Socket closed on teardown, or a probe connection with no request: stop quietly.
                if (socket.isClosed()) return;
            }
        }
    }

    /** Reads one request: request line, headers, then Content-Length bytes of body. */
    private static Recorded readRequest(InputStream in) throws IOException {
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            head.write(b);
            byte[] a = head.toByteArray();
            if (a.length >= 4
                && a[a.length - 4] == '\r' && a[a.length - 3] == '\n'
                && a[a.length - 2] == '\r' && a[a.length - 1] == '\n') {
                break;
            }
        }
        String[] lines = head.toString(StandardCharsets.ISO_8859_1).split("\r\n");
        if (lines.length == 0 || lines[0].isEmpty()) return null;

        Recorded r = new Recorded();
        String[] parts = lines[0].split(" ");
        r.method = parts.length > 0 ? parts[0] : "";
        r.path = parts.length > 1 ? parts[1] : "";
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon > 0) {
                r.headers.put(
                    lines[i].substring(0, colon).trim().toLowerCase(Locale.ROOT),
                    lines[i].substring(colon + 1).trim());
            }
        }
        String len = r.headers.get("content-length");
        if (len != null) {
            int n = Integer.parseInt(len);
            byte[] body = new byte[n];
            int read = 0;
            while (read < n) {
                int got = in.read(body, read, n - read);
                if (got == -1) break;
                read += got;
            }
            r.body = new String(body, 0, read, StandardCharsets.UTF_8);
        }
        return r;
    }

    private static void writeResponse(OutputStream out, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
            + "Content-Type: application/json\r\n"
            + "Content-Length: " + bytes.length + "\r\n"
            + "Connection: close\r\n"
            + "\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.write(bytes);
        out.flush();
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 201: return "Created";
            case 302: return "Found";
            case 500: return "Internal Server Error";
            default: return "Status";
        }
    }

    @Override
    public void close() throws IOException {
        socket.close();
        thread.interrupt();
    }

    /** One captured request. */
    static final class Recorded {
        String method;
        String path;
        final Map<String, String> headers = new HashMap<>();
        String body = "";
    }
}
