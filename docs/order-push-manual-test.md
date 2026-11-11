# 手机后台推送：不创建订单的手动验证

## 状态与前提

2026-11-09 用户再次明确确认后，正式 dineos-api 的 ORDER_PUSH_ENABLED 已从 false 恢复为 true。使用 Save and deploy，复用 ed373ca，不重新构建；部署 dep-dboimcc9v7es73fd51k0，10:08:49 GMT+8 开始，10:09:13 Live，耗时20.4秒。/livez 200（0.187334秒），/health 200/database connected（0.466517秒）。没有 Git 推送、Netlify 更新或数据库迁移。此前被安全审批拦截的尝试没有保存；本段记录的是新确认后的实际成功操作。

这里只确认线上开关已恢复、服务当前健康；尚未用已登录设备验证推送配置接口、供应商接受或手机显示。不能据此宣称手机通知已实测通过，也不是闲置唤醒问题已修复。

此配置会恢复后台通知处理，可能通知已有的有效订阅设备。不会新增正式订单；worker 只处理符合其状态和有效期条件的通知任务。不要为演示插入订单或直接操作生产数据库。

## 推荐：直接用手机上的现有页面

1. 登录 https://dine-os.netlify.app/cashier/notifications （管理员／收银员）。
2. iPhone 先通过 Safari 添加到主屏幕，再从图标打开；Android 使用支持 Web Push 的浏览器，例如 Chrome。
3. 点“在此设备启用”，本人允许系统通知权限。每个接收设备需单独订阅，不是账号统一授权。
4. 点“发送测试通知”；不要退出账号（退出会关闭当前设备订阅）。先确认前台收到了，再做后台／锁屏验证。
5. 推送供应商 accepted 不等于手机显示；必须亲眼在手机通知中心／锁屏看到。不要将模拟测试提醒当作真实订单。

## 终端延迟测试（可选）

本地 Node18+，从项目根目录运行：

```sh
node server/scripts/test-order-push.js --device-id <手机已订阅的deviceId> --delay 10
```

程序会隐藏输入地提示粘贴当前管理员／收银员的 Supabase **access_token**。不要把令牌放到命令行参数、Git、截图或聊天；不要使用 refresh_token、数据库密码、service-role key 或 VAPID 私钥。令牌仅向代码内固定的 DineOS 正式后端发送，禁止重定向，不写文件、不打印令牌。无法取得令牌时，用页面按钮，不要绕过登录。

deviceId 必须来自**接收通知的手机**，并与这个 access_token 的账号一致，不是订单号，也不是 Supabase user id。高级用户可在接收设备自己的页面控制台查看：

```js
JSON.parse(localStorage.getItem('dineos-order-push-device-v1') || 'null')?.deviceId
```

如需取得短期 access_token，可在自己已登录的同账号电脑网页 DevTools → Network → 已成功的 `/api/v1/me` 请求，查看 Authorization 中 Bearer 后面的值；只在本机脚本隐藏输入处粘贴。iPhone 不方便检查 deviceId 时无需做这一步，使用手机现有测试按钮即可。

脚本配置检查可能要等后端唤醒（最多90秒）；配置检查通过后延迟指定秒数（0–60秒）才 POST。等待期间把手机切到其他 App 或锁屏，保持网络，不要退出账号。它只使用现有 `/api/v1/operations/push/devices/:deviceId/test` 接口，不会 POST `/orders`。同设备测试间隔至少30秒。

- 401：登录已过期。
- 403：没有管理员／收银员权限，或设备不属于该账号（接口也可能返回429）。
- 429：设备未启用、已过期、不属于账号，或测试太频繁。
- 503／配置未就绪：开关、密钥、schema 或推送供应商未准备好。
- 超时：不自动重试；POST 可能已发出，先看手机再决定是否重试。

本地自动测试用假的 fetch，未实际发手机通知。手机显示与后台实测仍待用户完成。

## 不加入自我保活代码

Render 免费实例闲置15分钟会休眠；进程停止后 node-cron/setInterval 不能继续运行或唤醒自己。运行期间请求自己的公开 URL 可能产生入站流量，但不是休眠、平台重启或请求转发异常后的可靠恢复方案，因此本次没有安装 node-cron、没有写 self-ping，也未部署保活代码。

若另行使用 UptimeRobot，可监测 DB-free `/livez`，不要用 `/robots.txt`。外部监测只能减少部分闲置冷启动，不保证恢复目前未定位的原服务异常；持续运行会使用共享的免费实例小时。不在本任务中自动建立监控。

官方依据：https://render.com/docs/free ，https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
