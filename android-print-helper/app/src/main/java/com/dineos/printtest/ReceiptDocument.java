package com.dineos.printtest;

import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** Display data from an untrusted caller, never a payment authorization. */
public final class ReceiptDocument {
    public static final int MAX_BYTES = 32000;
    public static final class Row {
        public final String left, right, style;
        Row(String left, String right, String style) { this.left = left; this.right = right; this.style = style; }
    }
    public final String receiptNumber;
    public final boolean kitchen;
    public final List<Row> rows;
    private ReceiptDocument(String number, List<Row> rows, boolean kitchen) { receiptNumber = number; this.rows = Collections.unmodifiableList(rows); this.kitchen = kitchen; }
    public static ReceiptDocument parse(String json) throws JSONException {
        if (json == null || json.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new JSONException("Receipt too large");
        JSONObject doc = new JSONObject(json);
        String kind = doc.getString("kind");
        if (!(doc.get("version") instanceof Number) || doc.getDouble("version") != 1 || !("paid_receipt".equals(kind) || "kitchen_ticket".equals(kind))) throw new JSONException("Unsupported receipt format");
        String number = text(doc, "receiptNumber", 120);
        if (number.isEmpty()) throw new JSONException("Missing receipt number");
        JSONArray entries = doc.getJSONArray("rows");
        if (entries.length() < 1 || entries.length() > 300) throw new JSONException("Invalid row count");
        List<Row> rows = new ArrayList<>();
        Set<String> styles = new HashSet<>(Arrays.asList("normal", "bold", "heading", "center", "rule"));
        for (int i = 0; i < entries.length(); i++) {
            JSONObject row = entries.getJSONObject(i);
            String style = row.getString("style");
            if (!styles.contains(style)) throw new JSONException("Unknown row style");
            rows.add(new Row(text(row, "left", 1000), text(row, "right", 120), style));
        }
        return new ReceiptDocument(number, rows, "kitchen_ticket".equals(kind));
    }
    public static ReceiptDocument decode(String encoded) throws JSONException {
        if (encoded == null || encoded.length() > 42667 || !encoded.matches("[A-Za-z0-9_-]+")) throw new JSONException("Invalid receipt link");
        try {
            byte[] bytes = Base64.getUrlDecoder().decode(encoded);
            String json = new String(bytes, StandardCharsets.UTF_8);
            // Reject malformed UTF-8, not silently changed item names.
            if (!Arrays.equals(bytes, json.getBytes(StandardCharsets.UTF_8))) throw new JSONException("Invalid UTF-8");
            return parse(json);
        } catch (IllegalArgumentException error) { throw new JSONException("Invalid receipt encoding"); }
    }
    private static String text(JSONObject object, String key, int limit) throws JSONException {
        Object value = object.get(key);
        if (!(value instanceof String)) throw new JSONException("Invalid text");
        String text = (String) value;
        if (text.length() > limit || text.matches("(?s).*[\\x00-\\x1f\\x7f-\\x9f].*")) throw new JSONException("Invalid text length/control characters");
        return text;
    }
    public String preview() {
        StringBuilder result = new StringBuilder();
        for (Row row : rows) {
            if (row.style.equals("rule")) result.append("------------------------");
            else { result.append(row.left); if (!row.right.isEmpty()) result.append("  ").append(row.right); }
            result.append('\n');
        }
        return result.toString();
    }
}
