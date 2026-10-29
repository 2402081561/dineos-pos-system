import { normalizedEmail } from './memberEmailConfig.js'

function plain(value, fallback = '') {
  return String(value ?? fallback).replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, 120)
}
function escape(value) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

// A registration confirmation, not a marketing subscription. No OTP, access
// token, telephone number, points history or customer-session links are emailed.
export function welcomeMessage({ member, shopName, from }) {
  const to = normalizedEmail(member.email)
  if (!to) throw new Error('Invalid welcome recipient.')
  const shop = plain(shopName) || 'DineOS', name = plain(member.name) || 'Member'
  const memberId = plain(member.memberId)
  const text = `Welcome to ${shop}\n\nHi ${name}, your membership is ready.\nMember ID: ${memberId}\nNext time, sign in with your email and a verification code.\nYou can earn points on eligible purchases and redeem available rewards.\n\n欢迎加入 ${shop}\n${name}，您的会员注册已成功。\n会员编号：${memberId}\n下次请使用邮箱和验证码登录。符合条件的消费可获得积分，并兑换店内提供的奖励。\n\nThis email confirms your registration. It does not subscribe you to promotional emails.\n这是一封注册确认邮件，不代表您已订阅推广邮件。`
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#172033"><div style="max-width:520px;margin:24px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:16px"><p style="color:#ea580c;font-weight:bold">${escape(shop)}</p><h1 style="font-size:24px">Welcome to ${escape(shop)}</h1><p>Hi ${escape(name)}, your membership is ready.</p><p style="padding:16px;background:#fff7ed;border-radius:8px">Member ID / 会员编号<br><strong style="font-size:22px">${escape(memberId)}</strong></p><p>Next time, sign in with your email and a verification code.</p><p>You can earn points on eligible purchases and redeem available rewards.</p><hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0"><div lang="zh-Hans"><h2 style="font-size:20px">欢迎加入 ${escape(shop)}</h2><p>${escape(name)}，您的会员注册已成功。</p><p>下次请使用邮箱和验证码登录。符合条件的消费可获得积分，并兑换店内提供的奖励。</p></div><p style="font-size:12px;color:#64748b;margin-top:24px">This email confirms your registration. It does not subscribe you to promotional emails.<br>这是一封注册确认邮件，不代表您已订阅推广邮件。</p></div></body></html>`
  return { from, to: [to], subject: `Welcome to ${shop} · 欢迎加入`, text, html }
}

export class WelcomeDeliveryError extends Error {
  constructor(code, retryable = false) {
    super(code)
    this.code = code
    this.retryable = retryable
  }
}

export function createWelcomeSender({ config, fetchEmail = fetch }) {
  return async function send(body, key) {
    if (!config.welcomeEnabled) throw new WelcomeDeliveryError('EMAIL_DISABLED')
    if (config.mode === 'test' && (body.to?.length !== 1 || normalizedEmail(body.to[0]) !== config.testRecipient)) {
      throw new WelcomeDeliveryError('TEST_RECIPIENT_BLOCKED')
    }
    // Keep the stored payload unchanged on every retry, even if the shop name
    // or sender settings have since changed. Provider idempotency is 24 hours.
    let response
    try {
      response = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      })
    } catch { throw new WelcomeDeliveryError('EMAIL_RESPONSE_UNCERTAIN', true) }
    if (!response.ok) throw new WelcomeDeliveryError(`EMAIL_HTTP_${response.status}`, response.status === 429 || response.status >= 500)
    let result
    try { result = await response.json() } catch { throw new WelcomeDeliveryError('EMAIL_RESPONSE_UNCERTAIN', true) }
    if (typeof result?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.id)) throw new WelcomeDeliveryError('EMAIL_RESPONSE_UNCERTAIN', true)
    return result.id // Accepted by provider; NOT proof of inbox delivery.
  }
}
