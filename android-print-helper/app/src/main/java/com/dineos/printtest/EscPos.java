package com.dineos.printtest;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Fixed test payloads only: no drawer, cutter or printer configuration commands. */
public final class EscPos {
    private EscPos() {}
    public static byte[] english() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] prefix = {27, 64, 27, 97, 0};
        out.write(prefix, 0, prefix.length);
        byte[] text = "DineOS PRINT TEST\nNOT A RECEIPT\n------------------------\nTest item       RM 1.00\nCash            RM 2.00\nChange          RM 1.00\n------------------------\nEnglish test only\n\n\n\n".getBytes(StandardCharsets.US_ASCII);
        out.write(text, 0, text.length);
        return out.toByteArray();
    }
    public static byte[] raster(int width, int height, int[] pixels) {
        if (width < 8 || width > 576 || width % 8 != 0 || height < 1 || height > 2048 || pixels.length != width * height)
            throw new IllegalArgumentException("Invalid raster dimensions");
        int stride = width / 8;
        byte[] out = new byte[8 + stride * height];
        out[0] = 29; out[1] = 118; out[2] = 48; out[3] = 0;
        out[4] = (byte) stride; out[5] = (byte) (stride >> 8);
        out[6] = (byte) height; out[7] = (byte) (height >> 8);
        for (int i = 0; i < pixels.length; i++) {
            int c = pixels[i];
            int alpha = c >>> 24;
            int luminance = (299 * ((c >> 16) & 255) + 587 * ((c >> 8) & 255) + 114 * (c & 255)) / 1000;
            if ((luminance * alpha + 255 * (255 - alpha)) / 255 < 128)
                out[8 + i / 8] |= (byte) (128 >> (i % 8));
        }
        return out;
    }
}
