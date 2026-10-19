import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useMemo, useState } from 'react'
import StatePanel from '../common/StatePanel'
import { subscribeToSupabaseMemberPoints } from '../../services/adminApiService'
import { getPublicPoints } from '../../services/customerApi'
import { formatCurrency } from '../../utils/currency'

function amount(transaction) {
  const points = Number(transaction?.points)
  if (!Number.isFinite(points)) return 0
  if (['REDEEM', 'REFUND'].includes(String(transaction?.type).toUpperCase())) return -Math.abs(Math.floor(points))
  return Math.abs(Math.floor(points))
}
function PointsHistory({ memberId, sessionId = '', showFilters = false }) {
  const { t: uiText, formatDate: uiDate } = useCustomerLanguage()

  const { t } = useCustomerLanguage()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  useEffect(() => {
    let active = true
    setIsLoading(true)
    if (sessionId) {
      const load = async () => {
        try {
          const next = await getPublicPoints(sessionId)
          if (active) {
            setItems(next)
            setError('')
            setIsLoading(false)
          }
        } catch (apiError) {
          if (active) {
            console.error('[Points History] Failed to load:', apiError)
            setError('Points history is unavailable right now.')
            setIsLoading(false)
          }
        }
      }
      void load()
      const timer = window.setInterval(() => {
        void load()
      }, 15000)
      return () => {
        active = false
        window.clearInterval(timer)
      }
    }
    const unsubscribe = subscribeToSupabaseMemberPoints(
      memberId,
      (next) => {
        if (active) {
          setItems(next)
          setError('')
          setIsLoading(false)
        }
      },
      (apiError) => {
        if (active) {
          console.error('[Points History] Failed to load:', apiError)
          setError('Points history is unavailable right now.')
          setIsLoading(false)
        }
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [memberId, sessionId])
  const visible = useMemo(
    () =>
      items
        .filter((item) => {
          const type = String(item.type ?? '').toUpperCase()
          const matchingType = filter === 'all' || type === filter
          const matchingText =
            `${item.orderId ?? ''} ${item.receiptNumber ?? ''} ${item.redemptionReference ?? ''}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())
          return matchingType && matchingText
        })
        .sort(
          (a, b) =>
            (new Date(b.createdAt).getTime() || -1) - (new Date(a.createdAt).getTime() || -1),
        ),
    [filter, items, search],
  )
  return (
    <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5">
        <h2 className="font-bold text-slate-900">{t("Points history")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("Most recent 50 point activities.")}</p>
        {showFilters && (
          <div className="mt-4 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
            <select
              className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setFilter(event.target.value)}
              value={filter}
            >
              <option value="all">{t("All activity")}</option>
              <option value="EARN">{t("Earned")}</option>
              <option value="REDEEM">{t("Redeemed")}</option>
              <option value="REFUND">{t('Refund points reversal')}</option>
            </select>
            <input
              className="w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Order, receipt or redemption")}
              value={search}
            />
          </div>
        )}
      </div>
      {isLoading ? (
        <p className="p-5 text-sm text-slate-500">{t("Loading points history…")}</p>
      ) : error ? (
        <p className="p-5 text-sm text-red-700">{t(error)}</p>
      ) : visible.length === 0 ? (
        <div className="p-5">
          <StatePanel description={t("Start ordering to earn points.")} title={t("No points activity yet")} />
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {visible.map((item) => {
            const points = amount(item)
            const earned = points >= 0
            const label =
              String(item.type ?? '').toUpperCase() === 'REDEEM'
                ? item.rewardName || t("Reward redemption")
                : item.receiptNumber
                  ? t('Receipt {{number}}', { number: item.receiptNumber })
                  : item.orderId
                    ? t('Order {{number}}', { number: item.orderId })
                    : t("Payment points")
            return (
              <article className="flex items-start justify-between gap-4 p-5" key={item.id}>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">
                    {String(item.type).toUpperCase() === 'REFUND' ? t('Refund points reversal') : earned ? t("Points earned") : t("Points redeemed")}
                  </p>
                <p className="mt-1 break-words text-sm text-slate-600">{uiText(label)}</p>
                  {earned && Number.isFinite(Number(item.eligibleSpending)) && (
                    <p className="mt-1 text-xs text-slate-500">{t("Eligible spending:")}{' '}{formatCurrency(item.eligibleSpending)}
                    </p>
                  )}
                  {item.redemptionReference && (
                    <p className="mt-1 text-xs text-slate-500">{item.redemptionReference}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    {uiDate(item.createdAt) || t('Date unavailable')} · {item.source || '—'}
                  </p>
                </div>
                <p
                  className={`whitespace-nowrap font-extrabold ${earned ? 'text-emerald-700' : 'text-red-700'}`}
                >
                  {earned ? '+' : ''}
                  {t('{{count}} pts', { count: points })}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
export default PointsHistory
