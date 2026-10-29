package com.dineos.printtest;

import org.junit.Test;
import org.json.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class ReceiptDocumentTest {
    private JSONObject document() throws JSONException {
        return new JSONObject().put("version", 1).put("kind", "paid_receipt").put("receiptNumber", "R-001").put("rows", new JSONArray()
            .put(new JSONObject().put("left", "新🐔煮炒 Sinma").put("right", "").put("style", "heading"))
            .put(new JSONObject().put("left", "1× 炒面").put("right", "RM 9.00").put("style", "bold"))
            .put(new JSONObject().put("left", "打包").put("right", "").put("style", "normal")));
    }
    private String encode(String value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8)); }
    @Test public void unicodeRoundTrip() throws Exception {
        ReceiptDocument receipt = ReceiptDocument.decode(encode(document().toString()));
        assertEquals("R-001", receipt.receiptNumber); assertEquals(3, receipt.rows.size());
        assertTrue(receipt.preview().contains("新🐔煮炒 Sinma")); assertTrue(receipt.preview().contains("1× 炒面  RM 9.00"));
    }
    @Test public void kitchenTicketsHaveDistinctKind() throws Exception {
        ReceiptDocument kitchen = ReceiptDocument.parse(document().put("kind", "kitchen_ticket").toString());
        assertTrue(kitchen.kitchen);
        assertFalse(ReceiptDocument.parse(document().toString()).kitchen);
    }
    @Test public void rejectsOversizeAndInvalidEncoding() {
        for (String value : new String[]{"", "a".repeat(42668), "../test", "a#Intent;", "_w"}) assertThrows(JSONException.class, () -> ReceiptDocument.decode(value));
    }
    @Test public void rejectsOtherKindsAndVersions() throws Exception {
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(document().put("kind", "raw_escpos").toString()));
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(document().put("version", 2).toString()));
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(document().put("version", "1").toString()));
    }
    @Test public void rejectsMissingNumberAndRows() throws Exception {
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(document().put("receiptNumber", "").toString()));
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(document().put("rows", new JSONArray()).toString()));
        JSONObject doc = document(); JSONArray rows = doc.getJSONArray("rows");
        for (int i = 0; i < 300; i++) rows.put(rows.getJSONObject(0));
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(doc.toString()));
    }
    @Test public void rejectsPrinterCommandsControlsAndLongText() throws Exception {
        for (String value : new String[]{"\u001b@", "\u0000", "\n", "\u007f", "x".repeat(1001)}) {
            JSONObject doc = document(); doc.getJSONArray("rows").getJSONObject(0).put("left", value);
            assertThrows(JSONException.class, () -> ReceiptDocument.parse(doc.toString()));
        }
    }
    @Test public void rejectsUnknownStyleAndNonStringText() throws Exception {
        JSONObject doc = document(); doc.getJSONArray("rows").getJSONObject(0).put("style", "command");
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(doc.toString()));
        JSONObject numeric = document(); numeric.getJSONArray("rows").getJSONObject(0).put("right", 100);
        assertThrows(JSONException.class, () -> ReceiptDocument.parse(numeric.toString()));
    }
    @Test public void rowsAreImmutable() throws Exception {
        ReceiptDocument doc = ReceiptDocument.parse(document().toString());
        assertThrows(UnsupportedOperationException.class, () -> doc.rows.clear());
    }
    @Test public void rasterHeaderAndPixels() {
        int[] pixels = new int[16]; Arrays.fill(pixels, 0xffffffff); pixels[0] = pixels[7] = pixels[15] = 0xff000000;
        byte[] data = EscPos.raster(8, 2, pixels);
        assertEquals(10, data.length); assertEquals(29, data[0]); assertEquals(1, data[4]); assertEquals(2, data[6]);
        assertEquals(129, data[8] & 255); assertEquals(1, data[9] & 255);
        assertThrows(IllegalArgumentException.class, () -> EscPos.raster(577, 2, pixels));
    }
}
