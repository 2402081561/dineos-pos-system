# DineOS Android 打印助手 v0.2.0

将 DineOS 已付款收据通过 Android Chrome 交给蓝牙打印机。保留 v0.1.0 已实测成功的 SPP 连接、英文测试和中文图片测试。应用不登录、不联网、不收款、不改订单；没有 INTERNET 权限，不发送钱箱、切刀或固件设置指令。

## 安装与使用（Android 8.0 或以上）

1. 将 `app/build/outputs/apk/debug/app-debug.apk` 传到手机，用文件管理器打开，**覆盖更新旧版**，不必卸载。保持 Play Protect 开启，安装后可收回文件管理器的安装权限。应用名称现在是 DineOS Print Helper，包名和签名保持原样。
2. 手机系统蓝牙配对 RPP02N（默认 PIN `0000`），退出 Loyverse，避免争用。
3. 打开新版 DineOS 网页，用 Android Chrome 登录 admin/cashier。付款成功或历史已付款订单 → 打印收据 → 「蓝牙打印收据」。**网页更新尚未部署时，线上不会出现这个按钮。**
4. 助手打开后核对收据预览。允许附近设备权限、选择自己的打印机并连接。后续会记住选择，但不自动连接或自动打印。
5. 按「确认并打印当前收据」，再次确认。等待显示「数据已发送」，检查纸张，再按「返回 DineOS」。Android 可能先要求确认打开应用，这是正常系统交互。
6. 发送失败或中途离开应用，可能已有部分出纸，不会自动重试。再次尝试同一收据会提示。蓝牙发送完成不是打印机出纸回执。
7. 可继续使用英文/中文测试按钮；384 dots 可在横向裁切时尝试，默认 80mm/576 dots。

仅支持已配对的 Bluetooth Classic SPP。v0.1.0 的实际设备测试已由用户确认成功，v0.2.0 网页唤起及真实收据仍需手机验收。iOS 不支持该 APK。电脑和手机仍有「打印／保存 PDF」作为原有浏览器打印入口。

## 数据与安全边界

- Chrome Intent 明确指定 `com.dineos.printtest`。收据 JSON 以 UTF-8/base64url 通过本机 Intent 传递，不向第三方服务器发送，不放入 HTTP 回退地址，不携带密码、访问令牌或客户联系方式。收据保留必要的店铺联系方式和收银员显示名。
- 网页只在已付款收据详情成功加载后显示操作；后端既有收据 API 按 admin/cashier 权限校验付款，使用付款快照，因此分单只打印本次付款餐点。
- **本机深链接不是已验证来源或付款证明。** 任何本机调用方都可能构造显示数据，助手不独立查询数据库。每次必须人工核对 DineOS 的付款记录及预览，再确认打印；不把 Intent 的 `kind` 当授权依据。适用于有人操作的收银打印，不用于无人值守的验款凭证。
- 助手只解析受限文字行和五种排版样式；不接受 raw ESC/POS。拒绝控制符、未知版本、超长链接/内容。上限 32KB/300 行；超限时提示改用浏览器打印，绝不静默裁掉餐点。
- 不打印远程 Logo，以保持无网络权限。长中文名称、备注、加料分行，并以短位图条带发送。关闭收费项目按原始付款快照的零金额隐藏，历史实收费用仍保留。
- 网页只记既有 reprint **尝试**审计，不宣称出纸成功；助手不写数据库。重复打印有确认，但不禁止合法补印。
- 本机偏好仅存语言、纸宽、已选打印机及最近尝试的收据号，不保存收据全文，不上传偏好。

## 编译与验证

根目录 `.local-tools/` 内有 SDK、Gradle 和缓存，Git 忽略，不上传。使用 JDK 24、Gradle 8.14.3、Android SDK 35/build-tools 35.0.0。

从本目录执行（按自己的 JDK 路径设置 JAVA_HOME）：

```sh
ANDROID_HOME="$(pwd)/../.local-tools/android-sdk" GRADLE_USER_HOME="$(pwd)/../.local-tools/gradle-home" ../.local-tools/gradle-8.14.3/bin/gradle :app:assembleDebug :app:lintDebug :app:testDebugUnitTest --no-daemon
```

根目录网页检查：`npm run lint`、`npm run build`、`node --test tests/*.test.mjs`。

APK 使用与 v0.1.0 相同的本机 debug 签名，可覆盖安装；不是正式发行签名。不要分享 `/Users/jjchin/.android/debug.keystore` 私钥。改用正式签名需要另外规划迁移。

官方交接机制：[Chrome Android Intents](https://developer.chrome.com/docs/android/intents)、[Android deep links](https://developer.android.com/training/app-links/create-deeplinks)。Chrome 要求用户点击，不能在付款 API 返回后的异步回调中悄悄唤起应用，所以 Android 收据页需要再点一次蓝牙打印。
