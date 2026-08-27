package au.brianramsey.everylist;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.Arrays;

/** Unit tests for the `everylist://widget-config` deep-link parsing. */
public class WidgetConfigPayloadTest {

    @Test
    public void parsesAHandoffUrl() {
        WidgetConfigPayload payload = WidgetConfigPayload.parse(
            "everylist://widget-config?token=elt_abc123&serverUrl=https%3A%2F%2Feverylist.example.com&listIds=1%2C7");
        assertNotNull(payload);
        assertEquals("elt_abc123", payload.token);
        assertEquals("https://everylist.example.com", payload.serverUrl);
        assertEquals(Arrays.asList(1L, 7L), payload.listIds);
    }

    @Test
    public void handlesUnencodedValues() {
        WidgetConfigPayload payload = WidgetConfigPayload.parse(
            "everylist://widget-config?listIds=3&token=elt_plain&serverUrl=https://host");
        assertNotNull(payload);
        assertEquals(Arrays.asList(3L), payload.listIds);
        assertEquals("elt_plain", payload.token);
        assertEquals("https://host", payload.serverUrl);
    }

    @Test
    public void returnsNullForNonWidgetConfigHosts() {
        assertNull(WidgetConfigPayload.parse("everylist://lists/5"));
        assertNull(WidgetConfigPayload.parse("https://other.example.com/widget-config?token=a&listIds=1&serverUrl=b"));
    }

    @Test
    public void returnsNullWhenRequiredFieldsMissing() {
        assertNull(WidgetConfigPayload.parse("everylist://widget-config?listIds=1&serverUrl=b"));
        assertNull(WidgetConfigPayload.parse("everylist://widget-config?token=a&serverUrl=b"));
        assertNull(WidgetConfigPayload.parse("everylist://widget-config?token=a&listIds=1"));
    }

    @Test
    public void returnsNullForGarbage() {
        assertNull(WidgetConfigPayload.parse("not a uri"));
        assertNull(WidgetConfigPayload.parse(null));
    }
}