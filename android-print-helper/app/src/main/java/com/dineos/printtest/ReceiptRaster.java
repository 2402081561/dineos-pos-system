package com.dineos.printtest;

import android.graphics.*;
import android.text.*;
import java.io.IOException;
import java.util.*;

/** Wrap before printing; rasterize in short strips to bound printer/RAM use. */
public final class ReceiptRaster {
    public interface Sink { void write(byte[] bytes) throws IOException, InterruptedException; }
    private static final class Block {
        StaticLayout left, right;
        int rightX, height;
        boolean rule;
    }
    private static StaticLayout layout(String text, int width, TextPaint paint, Layout.Alignment alignment) {
        return StaticLayout.Builder.obtain(text, 0, text.length(), paint, width).setAlignment(alignment).setIncludePad(false).build();
    }
    public static void print(ReceiptDocument document, int width, Sink sink) throws IOException, InterruptedException {
        if (width != 384 && width != 576) throw new IOException("Unsupported print width");
        int margin = 14, available = width - margin * 2, totalHeight = 0;
        List<Block> blocks = new ArrayList<>();
        for (ReceiptDocument.Row row : document.rows) {
            Block block = new Block(); block.rule = row.style.equals("rule");
            if (block.rule) block.height = 24;
            else {
                TextPaint paint = new TextPaint(Paint.ANTI_ALIAS_FLAG); paint.setColor(Color.BLACK);
                paint.setTextSize(row.style.equals("heading") ? (width == 576 ? 34 : 30) : (width == 576 ? 26 : 24));
                paint.setTypeface(row.style.equals("bold") || row.style.equals("heading") ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
                if (row.right.isEmpty()) block.left = layout(row.left, available, paint, row.style.equals("heading") || row.style.equals("center") ? Layout.Alignment.ALIGN_CENTER : Layout.Alignment.ALIGN_NORMAL);
                else {
                    int rightWidth = Math.max(available / 3, Math.min(available / 2, (int) Math.ceil(paint.measureText(row.right))));
                    block.rightX = available - rightWidth;
                    block.left = layout(row.left, block.rightX - 12, paint, Layout.Alignment.ALIGN_NORMAL);
                    block.right = layout(row.right, rightWidth, paint, Layout.Alignment.ALIGN_OPPOSITE);
                }
                block.height = Math.max(block.left.getHeight(), block.right == null ? 0 : block.right.getHeight()) + 10;
            }
            totalHeight += block.height;
            if (totalHeight > 30000) throw new IOException("Receipt is too long; use browser printing");
            blocks.add(block);
        }
        // Validate complete layout before sending even the first printer byte.
        sink.write(new byte[]{27, 64, 27, 97, 0});
        for (Block block : blocks) for (int offset = 0; offset < block.height; offset += 256) {
            int height = Math.min(256, block.height - offset);
            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            try {
                Canvas canvas = new Canvas(bitmap); canvas.drawColor(Color.WHITE); canvas.translate(margin, -offset);
                if (block.rule) { Paint paint = new Paint(); paint.setColor(Color.BLACK); paint.setStrokeWidth(1); canvas.drawLine(0, 12, available, 12, paint); }
                else { block.left.draw(canvas); if (block.right != null) { canvas.translate(block.rightX, 0); block.right.draw(canvas); } }
                int[] pixels = new int[width * height]; bitmap.getPixels(pixels, 0, width, 0, 0, width, height);
                sink.write(EscPos.raster(width, height, pixels));
            } finally { bitmap.recycle(); }
        }
        sink.write(new byte[]{10, 10, 10, 10});
    }
    private ReceiptRaster() {}
}
