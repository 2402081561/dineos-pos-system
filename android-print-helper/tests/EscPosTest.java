import com.dineos.printtest.EscPos;
import java.util.Arrays;
public class EscPosTest {
    private static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) {
        int[] pixels = new int[8]; Arrays.fill(pixels, 0xffffffff); pixels[0] = 0xff000000; pixels[7] = 0xff000000;
        byte[] raster = EscPos.raster(8, 1, pixels);
        check(raster.length == 9 && raster[0] == 29 && raster[4] == 1 && raster[6] == 1 && (raster[8] & 255) == 129);
        Arrays.fill(pixels, 0x00000000); check(EscPos.raster(8, 1, pixels)[8] == 0);
        check(EscPos.raster(576, 320, new int[576 * 320]).length == 23048);
        try { EscPos.raster(7, 1, pixels); throw new AssertionError(); } catch (IllegalArgumentException expected) {}
        try { EscPos.raster(8, 2, pixels); throw new AssertionError(); } catch (IllegalArgumentException expected) {}
        byte[] english = EscPos.english(); check(english[0] == 27 && english[1] == 64);
        check(new String(english, java.nio.charset.StandardCharsets.US_ASCII).contains("NOT A RECEIPT"));
        System.out.println("7 ESC/POS tests passed");
    }
}
