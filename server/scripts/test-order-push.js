import { pathToFileURL } from 'node:url'

const api = 'https://dineos-api-x84l.onrender.com'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// One owned-device test only. Never creates orders, reads subscriptions,
// accepts an arbitrary destination, loads .env, or uses the VAPID private key.
export async function sendTestPush({ deviceId, token, delaySeconds = 10, fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  if (!uuid.test(deviceId ?? '')) throw new Error('需要通知接收设备的 UUID（deviceId）。')
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token ?? '')) throw new Error('需要当前管理员／收银员的有效登录 access_token，不是密码或 VAPID 密钥。')
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 60) throw new Error('延迟必须是 0–60 秒。')
  const headers = { Authorization: `Bearer ${token}` }
  async function call(path, options, timeoutMs) {
    let response
    try { response = await fetchImpl(api + path, { ...options, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' }) }
    catch { throw new Error('服务器／网络未确认响应；测试不会自动重试。POST 超时也可能已经发出，请先看手机。') }
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const messages = { 401: '登录令牌已过期或无效。', 403: '该账号没有管理员／收银员权限。', 429: '设备未启用、已过期，或距离上次测试不足 30 秒。', 503: '推送尚未启用、配置无效或推送服务未确认接收。' }
      throw new Error(`HTTP ${response.status}: ${messages[response.status] ?? '服务器没有确认测试通知。'}`)
    }
    return data
  }
  const config = await call('/api/v1/operations/push/config', { headers }, 90000)
  if (!config.enabled || !config.schemaReady) throw new Error('正式后端推送开关、密钥或数据库配置尚未就绪。')
  await wait(delaySeconds * 1000)
  const data = await call(`/api/v1/operations/push/devices/${deviceId}/test`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }, 15000)
  if (data.accepted !== true) throw new Error('接口没有确认推送服务已接受通知。')
  return { accepted: true, deviceReceiptConfirmed: false }
}

export async function readToken(input = process.stdin, output = process.stderr) {
  if (!input.isTTY) {
    let value = ''
    for await (const chunk of input) {
      value += chunk
      if (value.length > 16384) throw new Error('令牌输入过长。')
    }
    return value.trim()
  }
  output.write('粘贴当前员工 access_token（隐藏输入；不要发到聊天），按 Enter：')
  const wasRaw = input.isRaw
  input.setRawMode(true); input.resume(); input.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let value = ''
    function finish(error) {
      input.off('data', onData); input.setRawMode(wasRaw); input.pause(); output.write('\n')
      if (error) reject(error); else resolve(value.trim())
    }
    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\u0003' || character === '\u0004') return finish(new Error('已取消，未发送。'))
        if (character === '\r' || character === '\n') return finish()
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1)
        else if (/^[A-Za-z0-9_.-]$/.test(character)) value += character
        if (value.length > 16384) return finish(new Error('令牌输入过长。'))
      }
    }
    input.on('data', onData)
  })
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.info('node server/scripts/test-order-push.js --device-id <已订阅设备UUID> [--delay 10]\n令牌通过隐藏提示或标准输入读取；不接受命令行令牌，不创建订单，不自动重试。')
    return
  }
  if (args.length % 2 !== 0 || args.some((value, index) => index % 2 === 0 && !['--device-id', '--delay'].includes(value))) throw new Error('仅支持 --device-id 和 --delay；运行 --help 查看帮助。')
  const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, index) => [args[index * 2], args[index * 2 + 1]]))
  const deviceId = options['--device-id'], delaySeconds = Number(options['--delay'] ?? 10)
  if (!uuid.test(deviceId ?? '')) throw new Error('请提供 --device-id <已订阅设备UUID>。')
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 60) throw new Error('--delay 必须是 0–60 秒。')
  const token = await readToken()
  console.info(`仅向指定设备发送测试提醒；检查配置后延迟 ${delaySeconds} 秒。请将手机切到后台／锁屏，但不要退出账号。`)
  await sendTestPush({ deviceId, token, delaySeconds })
  console.info('推送服务已接受测试提醒；这不代表手机实际显示。请在手机确认，无正式订单被创建。')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
