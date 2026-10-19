package com.dineos.printtest;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.*;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.View;
import android.widget.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Paired-device-only transport; incoming documents always require confirmation. */
public class MainActivity extends Activity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    private final AtomicInteger generation = new AtomicInteger();
    private volatile BluetoothSocket socket;
    private volatile boolean busy;
    private volatile boolean destroyed;
    private BluetoothAdapter adapter;
    private Spinner devices, widths;
    private final ArrayList<BluetoothDevice> paired = new ArrayList<>();
    private TextView status;
    private TextView receiptSummary, receiptPreview;
    private ReceiptDocument pendingReceipt;
    private AlertDialog confirmation;
    private boolean chinese = true;
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb");

    private String t(String zh, String en) { return chinese ? zh : en; }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        chinese = getPreferences(0).getBoolean("zh", true);
        BluetoothManager manager = getSystemService(BluetoothManager.class);
        adapter = manager == null ? null : manager.getAdapter();
        ScrollView scroll = new ScrollView(this);
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL); body.setPadding(28, 40, 28, 40);
        scroll.addView(body); setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        scroll.requestApplyInsets();
        label(body, "DineOS Print Helper · 0.2.0", 26);
        label(body, t("打印助手 · 不收款 · 无联网权限", "Print helper · No payments or internet permission"), 16);
        button(body, chinese ? "English" : "中文", v -> {
            getPreferences(0).edit().putBoolean("zh", !chinese).apply(); recreate();
        });
        receiptSummary = label(body, t("尚未收到网页收据。请从 DineOS 已付款收据页按「蓝牙打印收据」。", "No receipt received. Tap Bluetooth print on a paid DineOS receipt page."), 18);
        label(body, t("1. 先在系统蓝牙设置配对 RPP02N，PIN 通常为 0000。测试前退出 Loyverse，避免连接冲突。", "1. Pair RPP02N in Android Bluetooth settings (usually PIN 0000). Close Loyverse to avoid connection contention."), 17);
        button(body, t("打开蓝牙设置", "Bluetooth settings"), v -> startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
        button(body, t("授权并刷新已配对设备", "Allow access / refresh paired devices"), v -> refresh());
        devices = new Spinner(this); body.addView(devices);
        label(body, t("2. 选择你自己的打印机，再尝试连接。只测试标准 SPP 蓝牙；BLE-only 型号暂不支持。", "2. Select your printer and connect. Tests standard Bluetooth SPP only; BLE-only printers are not supported yet."), 17);
        button(body, t("连接选中的打印机", "Connect selected printer"), v -> connect());
        widths = new Spinner(this);
        widths.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item,
            new String[]{"80mm / 576 dots", "384 dots (if image is cut off)"})); body.addView(widths);
        widths.setSelection(getPreferences(0).getInt("width", 0) == 1 ? 1 : 0);
        button(body, t("确认并打印当前收据", "Confirm and print receipt"), v -> confirmReceipt());
        button(body, t("返回 DineOS", "Return to DineOS"), v -> {
            if (busy) { log(t("请等到数据发送完成再返回；如需中止，请先按停止。", "Wait until data is sent before returning; press Stop to cancel.")); return; }
            finish();
        });
        button(body, t("打印英文测试", "Print English test"), v -> print(false));
        button(body, t("打印中文图片测试", "Print Chinese bitmap test"), v -> print(true));
        button(body, t("停止 / 断开连接", "Stop / disconnect"), v -> { disconnect(); log(t("已断开。若已发出部分数据，可能仍会出纸；不要连续重复打印。", "Disconnected. Already-sent data may still print; avoid repeated retries.")); });
        status = label(body, t("请选择设备。发送成功不代表已出纸，需要实际检查打印结果。", "Select a device. Data sent does not confirm paper output; check the printer."), 16);
        receiptPreview = label(body, "", 15);
        if (permission()) refresh();
        receive(getIntent());
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); disconnect(); setIntent(intent); receive(intent);
    }
    private void receive(Intent intent) {
        if (confirmation != null) confirmation.dismiss();
        pendingReceipt = null; receiptPreview.setText("");
        receiptSummary.setText(t("尚未收到网页收据。", "No receipt received."));
        if (intent == null || intent.getData() == null) return;
        try {
            Uri uri = intent.getData();
            if (uri.toString().length() > 43000 || !Intent.ACTION_VIEW.equals(intent.getAction()) || !"dineosprint".equals(uri.getScheme()) || !"receipt".equals(uri.getHost()) || uri.getPort() != -1 || uri.getUserInfo() != null || (uri.getPath() != null && !uri.getPath().isEmpty()) || uri.getFragment() != null || uri.getQueryParameters("payload").size() != 1 || uri.getQueryParameterNames().size() != 1) throw new IllegalArgumentException();
            pendingReceipt = ReceiptDocument.decode(uri.getQueryParameter("payload"));
            receiptSummary.setText(t("待打印收据：", "Receipt to print: ") + pendingReceipt.receiptNumber);
            receiptPreview.setText(pendingReceipt.preview());
            log(t("请核对下方预览及 DineOS 的付款记录，再连接打印机并确认打印。本助手不能验证付款或网页来源。", "Check the preview and payment in DineOS, then connect and confirm printing. This helper cannot verify payment or website origin."));
        } catch (org.json.JSONException | IllegalArgumentException error) {
            pendingReceipt = null;
            log(t("收据链接无效或过长。请从 DineOS 重新打开，或改用浏览器打印。", "Invalid/oversized receipt link. Reopen from DineOS or use browser printing."));
        }
    }
    private void confirmReceipt() {
        ReceiptDocument document = pendingReceipt;
        if (document == null) { log(t("请先从 DineOS 打开已付款收据。", "Open a paid receipt from DineOS first.")); return; }
        if (busy) { log(t("正在处理中，请勿重复按。", "Busy; do not tap repeatedly.")); return; }
        String duplicate = document.receiptNumber.equals(getPreferences(0).getString("lastSent", ""))
            ? t("\n注意：这张收据之前尝试过打印，重印前请确认纸张。", "\nWarning: printing this receipt was attempted before. Check paper before reprinting.") : "";
        confirmation = new AlertDialog.Builder(this).setTitle(t("确认打印？", "Confirm printing?"))
            .setMessage(document.receiptNumber + "\n" + t("请确认已收款及预览金额。打印不改变付款状态。", "Confirm payment and preview totals. Printing does not change payment status.") + duplicate)
            .setNegativeButton(t("取消", "Cancel"), null)
            .setPositiveButton(t("打印", "Print"), (dialog, which) -> { if (pendingReceipt == document) printJob(false, document); }).create();
        confirmation.show();
    }
    private TextView label(LinearLayout parent, String text, int size) {
        TextView view = new TextView(this); view.setText(text); view.setTextSize(size); view.setPadding(0, 12, 0, 12); parent.addView(view); return view;
    }
    private void button(LinearLayout parent, String text, View.OnClickListener action) {
        Button button = new Button(this); button.setText(text); button.setAllCaps(false); button.setOnClickListener(action); parent.addView(button);
    }
    private void log(String message) {
        runOnUiThread(() -> { if (!destroyed && status != null) status.setText(message); });
    }
    private boolean permission() { return Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED; }
    @SuppressWarnings("MissingPermission") private void refresh() {
        if (!permission()) { requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, 1); return; }
        if (adapter == null || !adapter.isEnabled()) { log(t("请先开启蓝牙。", "Enable Bluetooth first.")); return; }
        paired.clear(); paired.addAll(adapter.getBondedDevices());
        paired.sort(Comparator.comparing(d -> d.getName() == null ? "" : d.getName()));
        ArrayList<String> names = new ArrayList<>();
        for (BluetoothDevice d : paired) {
            String address = d.getAddress();
            names.add((d.getName() == null ? "Bluetooth device" : d.getName()) + " · …" + address.substring(Math.max(0, address.length() - 5)));
        }
        devices.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, names));
        String remembered = getPreferences(0).getString("printer", "");
        for (int i = 0; i < paired.size(); i++) if (remembered.equals(paired.get(i).getAddress())) devices.setSelection(i);
        log(t("已配对设备：", "Paired devices: ") + paired.size());
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == 1 && permission()) refresh(); else log(t("未授予附近设备权限，请在系统设置中允许。", "Nearby devices permission denied. Allow it in system settings."));
    }
    @SuppressWarnings("MissingPermission") private synchronized void connect() {
        if (busy) { log(t("正在处理中，请稍候或按停止。", "Busy; wait or press Stop.")); return; }
        if (!permission() || adapter == null || !adapter.isEnabled()) { refresh(); return; }
        int index = devices.getSelectedItemPosition();
        if (index < 0 || index >= paired.size()) { log(t("先刷新并选择打印机。", "Refresh and select a printer first.")); return; }
        BluetoothDevice device = paired.get(index);
        if (device.getType() == BluetoothDevice.DEVICE_TYPE_LE) { log(t("此设备仅 BLE，本测试助手暂不支持。", "BLE-only device; not supported by this test helper.")); return; }
        disconnect(); busy = true;
        int token = generation.get();
        log(t("正在尝试标准 SPP 连接（最多约 15 秒）…", "Trying standard SPP (up to 15 seconds)…"));
        worker.execute(() -> {
            BluetoothSocket attempt = null;
            ScheduledFuture<?> timeout = null;
            try {
                attempt = device.createRfcommSocketToServiceRecord(SPP);
                synchronized (this) { if (generation.get() != token) { attempt.close(); return; } socket = attempt; }
                BluetoothSocket target = attempt;
                timeout = timer.schedule(() -> { try { target.close(); } catch (IOException ignored) {} }, 15, TimeUnit.SECONDS);
                attempt.connect();
                if (generation.get() == token) {
                    getPreferences(0).edit().putString("printer", device.getAddress()).apply();
                    log(t("已连接。可确认打印收据或先做测试。", "Connected. Confirm receipt printing or run a test."));
                }
            } catch (IOException | SecurityException error) {
                if (generation.get() == token) { closeSocket(); log(t("连接失败或超时。确认已配对、Loyverse 已退出；该型号也可能不提供标准 SPP。", "Connection failed/timed out. Check pairing, close Loyverse; this model may not expose standard SPP.")); }
            } finally { if (timeout != null) timeout.cancel(false); if (generation.get() == token) busy = false; }
        });
    }
    private void print(boolean bitmap) { printJob(bitmap, null); }
    private synchronized void printJob(boolean bitmap, ReceiptDocument document) {
        if (!permission()) { disconnect(); log(t("请重新授予附近设备权限。", "Please grant Nearby devices permission again.")); return; }
        if (busy) { log(t("正在处理中，请勿重复按。", "Busy; do not tap repeatedly.")); return; }
        BluetoothSocket target = socket;
        if (target == null || !target.isConnected()) { log(t("请先连接打印机。", "Connect the printer first.")); return; }
        int width = widths.getSelectedItemPosition() == 1 ? 384 : 576;
        getPreferences(0).edit().putInt("width", widths.getSelectedItemPosition()).apply();
        int token = generation.get(); busy = true;
        log(t("正在发送，请勿重复按…", "Sending; do not tap repeatedly…"));
        worker.execute(() -> {
            ScheduledFuture<?> timeout = timer.schedule(() -> { try { target.close(); } catch (IOException ignored) {} }, document == null ? 20 : 120, TimeUnit.SECONDS);
            try {
                OutputStream out = target.getOutputStream();
                ReceiptRaster.Sink sink = bytes -> {
                    for (int offset = 0; offset < bytes.length; offset += 512) {
                        if (generation.get() != token) throw new InterruptedException();
                        out.write(bytes, offset, Math.min(512, bytes.length - offset)); out.flush(); Thread.sleep(15);
                    }
                };
                if (document == null) sink.write(bitmap ? chineseBitmap(width) : EscPos.english());
                else {
                    // Conservatively remember the attempt before bytes can leave.
                    getPreferences(0).edit().putString("lastSent", document.receiptNumber).apply();
                    ReceiptRaster.print(document, width, sink);
                }
                if (generation.get() == token) log(t("数据已发送，请检查实际出纸。没有打印成功回执，不会自动重试。", "Data sent; check paper. No printer success acknowledgement; no automatic retry."));
            } catch (IOException | InterruptedException | SecurityException error) {
                if (generation.get() == token) { closeSocket(); log(t("发送失败，可能已打印一部分。请先检查纸张再决定是否重试。", "Send failed; partial output is possible. Check paper before retrying.")); }
            } finally { timeout.cancel(false); if (generation.get() == token) busy = false; }
        });
    }
    private byte[] chineseBitmap(int width) throws IOException {
        Bitmap image = Bitmap.createBitmap(width, 320, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(image); canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(); paint.setColor(Color.BLACK); paint.setTextSize(width == 576 ? 30 : 24);
        String[] lines = {"DineOS 中文打印测试", "测试用途 · 不是正式收据", "炒面 × 1       RM 9.00", "现金           RM 10.00", "找回           RM 1.00", "谢谢光临！"};
        for (int i = 0; i < lines.length; i++) canvas.drawText(lines[i], 12, 42 + i * 44, paint);
        int[] pixels = new int[width * 320]; image.getPixels(pixels, 0, width, 0, 0, width, 320); image.recycle();
        ByteArrayOutputStream out = new ByteArrayOutputStream(); out.write(new byte[]{27, 64, 27, 97, 0}); out.write(EscPos.raster(width, 320, pixels)); out.write(new byte[]{10, 10, 10, 10}); return out.toByteArray();
    }
    private void closeSocket() { BluetoothSocket old = socket; socket = null; if (old != null) try { old.close(); } catch (IOException ignored) {} }
    private synchronized void disconnect() { generation.incrementAndGet(); closeSocket(); busy = false; }
    @Override protected void onStop() {
        if (confirmation != null) confirmation.dismiss();
        if (busy) log(t("离开应用已中止传输。可能有部分出纸，请检查后再重试。", "Leaving the app stopped transmission. Partial output is possible; check paper before retrying."));
        disconnect(); super.onStop();
    }
    @Override protected void onDestroy() { destroyed = true; disconnect(); worker.shutdownNow(); timer.shutdownNow(); super.onDestroy(); }
}
