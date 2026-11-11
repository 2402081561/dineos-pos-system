import { Component } from 'react'
import { useLocation } from 'react-router-dom'

export class AppErrorBoundary extends Component {
  state = { failed: false, resetKey: this.props.resetKey }
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null
  }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error('[DineOS] Page could not render:', error) }
  render() {
    if (!this.state.failed) return this.props.children
    let chinese = false
    try { chinese = localStorage.getItem('dineos:customer-language') === 'zh' } catch { /* safe fallback */ }
    return <section role="alert" className="mx-auto my-8 max-w-lg space-y-4 rounded-2xl border border-amber-200 bg-white p-6">
      <h1 className="text-xl font-bold">{chinese ? '此页面暂时无法显示' : 'This page could not be displayed'}</h1>
      <p className="text-sm text-slate-600">{chinese ? '重新加载不会主动清空已保存的订单或付款确认。请勿再次收款，先核对上一笔付款。' : 'Reloading does not intentionally clear saved orders or payment confirmations. Check the last payment before collecting money again.'}</p>
      <button type="button" className="rounded-lg bg-orange-600 px-4 py-3 font-bold text-white" onClick={() => window.location.reload()}>{chinese ? '重新加载页面' : 'Reload page'}</button>
    </section>
  }
}

export default function PageErrorBoundary({ children }) {
  const { pathname } = useLocation()
  // Reset an error on navigation without remounting the entire portal shell.
  return <AppErrorBoundary resetKey={pathname}>{children}</AppErrorBoundary>
}
