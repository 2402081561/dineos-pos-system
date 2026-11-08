# 打包订单手机通知（开发版，未部署）

## 已实现的范围

- 管理员、收银员可从「订单通知」为**当前设备**自愿开启／关闭／发送测试通知。不是全店统一开关。
- 支持标准 Web Push 的 Android 浏览器；iPhone 需要 iOS 16.4+，从 Safari「添加到主屏幕」后由该图标进入。无需原生打印助手、开发者模式、Apple 开发者年费或 Gmail OTP 服务。
- 仅新建的 `take_away` / `mixed` 订单推送，包括现有顾客 QR 流程和柜台代点；纯堂食不推送。不新增任何顾客下单权限，不绕过暂停接单／营业时间检查。
- 独立无桌号「打包专用二维码」已在本地开发，需升级 037 并开启开关，见 [打包二维码本地说明](takeaway-qr-local.md)。不要把柜台散客接口公开，也不要伪造共享散客会话。
- 通知显示通用标题，不含顾客姓名、电话、车牌、备注、餐点或金额。点击进入受保护的 `/cashier?orderId=...`；需要重新登录时保留目的订单，不自动登录或操作付款。
- Worker 不缓存页面/API，没有离线下单，也不会影响顾客原本的首页或菜单收藏。安装用的 manifest 仅在管理员／收银页面提供。

## 数据与可靠性

- 升级 `036_order_push.sql` 与 032/033 无依赖，不改写已有订单／付款。没有历史订单补发。
- 订单 INSERT 的同一事务为当时已订阅且未过期的管理员／收银设备写入 outbox。ROLLBACK 不会推送；幂等请求返回同一订单，不新增队列。
- 每个订单、设备最多一个 outbox 记录。发送器在订单提交后读取，使用租约与 `SKIP LOCKED` 支持重启恢复和多实例。
- 网络错误、408/429/5xx 退避重试，上限 5 次／15 分钟；404/410 停用失效设备。已取消／已完成订单、撤销角色、关闭设备、过期订阅不再发送。旧通知不应在长时间恢复后当成新单提示。
- 推送服务接受不等于手机收到，不能承诺百分百或严格一次送达；超时后的重试可能再次提醒，稳定 notification tag 用于合并。订单列表始终是接单依据。
- 7 天后仅清理终态通知队列，不清理业务记录。设备订阅有效 30 天，每账号最多 10 台活跃设备。此版本续期方式为在通知页关闭再开启。
- 退出账号先删除该账号当前设备的订阅，再浏览器取消订阅；后台断网时仍尝试本机取消。两个步骤都失败则保留设备归属并提示，不能声称已关闭。其他账号退出不会取消当前设备所有者的通知。
- 订阅端点是敏感 capability，仅服务器存储；表启用 RLS 并撤销 anon/authenticated 直接访问。发送主机严格限制为 Apple/FCM/Mozilla，不接受任意 URL，避免 SSRF。端点切换账号须先关闭旧订阅。

## 本地与上线配置

1. `npm --prefix server ci` 安装锁定版本依赖。
2. 独立本地数据库可用 `node server/scripts/upgrade-order-push.js --local`。会先生成并验证私有备份，**只应用 036**，核对订单／付款数量；不会升级正式库。
3. `node server/scripts/create-order-push-env.js` 可生成稳定 VAPID 密钥到被 git 忽略、权限 0600 的 `.local-tools/order-push.env`。脚本不会打印私钥、覆盖已有文件或启用发送。不要把私钥放到 VITE_ 变量或提交 Git。
4. 上线前另行取得用户许可、备份正式库，再单独应用 036，不要为了这个功能顺便运行所有尚未应用的迁移。
5. 后端设置 `.env.example` 中 ORDER_PUSH_ 变量。APP_ORIGIN 必须是实际前端 HTTPS origin、无末尾斜线；SUBJECT 是联系邮箱（不需要它能发邮件）。前端无需私钥。发布到获准的 HTTPS 网站并保持后台在线后才能设 ENABLED=true。
6. 不会自动部署 Netlify／Render，不会推 GitHub。localhost 能验证界面/API，**无法替代手机锁屏实测**；手机的 localhost 不是这台 Mac。

若后端暂停、休眠或离线，订单请求／推送处理可能延迟。通知不保活后端，不允许为了该功能擅自升级付费方案。

## 验证

自动化：

```
node --test tests/orderNotifications.test.mjs
node --test server/tests/order-push.test.js
DINEOS_DATABASE_TESTS=1 DATABASE_URL=postgresql://dineos_local@127.0.0.1:55434/postgres node --test server/tests/order-push-db.test.js
```

数据库测试只允许 localhost，创建／销毁随机临时数据库，使用合成资料和假的发送器，不发真实推送。覆盖提交／回滚、重复订单、角色、跨账号设备隔离、并发 worker、重试、失效端点、取消、过期与关闭。

上线后必须分别用 iPhone 与 Android：

- 开启并发送测试，**本人确认手机实际看到**，而非只看 API accepted。
- 锁屏／关闭网页后，由第二设备提交打包订单，核对通知并点击进入正确订单。
- 手机原来有草稿／付款窗口，通知不得把那个窗口导航离开；新窗口可能需要登录，登录后回到目标订单。
- 纯堂食不通知；混合单通知一次；重复提交同一请求不新增订单／outbox。
- 拒绝通知、静音／Focus、断网再恢复、注销登录、关闭通知与重新开启。
- 未打开页面时的锁屏接收尚未实测前，不宣称功能已经正式可用。

平台依据：

- [Apple/WebKit：iPhone 主屏幕 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [web-push 官方实现与协议说明](https://github.com/web-push-libs/web-push)
