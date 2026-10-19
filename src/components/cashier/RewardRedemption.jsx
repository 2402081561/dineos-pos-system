import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import { useEffect, useState } from 'react'
import Button from '../common/Button'
import { redeemSupabaseCashierReward, subscribeToSupabaseCashierRewards } from '../../services/adminApiService'

function RewardRedemption({ member, onComplete }) {
  const { t: uiText } = useCustomerLanguage()

  const [rewards, setRewards] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState('')
  useEffect(() => { const a = subscribeToSupabaseCashierRewards(setRewards, () => setError('Could not load rewards.')); return () => { a() } }, [])
  async function redeem(reward) { try { setBusy(reward.id); setError(''); const result = await redeemSupabaseCashierReward(member.memberId, reward.id); onComplete(result) } catch (e) { setError(e instanceof Error ? e.message : 'Could not redeem.') } finally { setBusy('') } }
  const valid = rewards.filter((reward) => reward.isAvailable === true && Number.isInteger(Number(reward.pointsRequired)) && Number(reward.pointsRequired) > 0)
  return <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm"><p className="eyebrow">{uiText("Rewards")}</p><h2 className="mt-1 font-bold">{uiText("Redeem for")}{' '}{member.name || member.memberId}</h2>{error && <p className="mt-3 text-sm text-red-700">{uiText(error)}</p>}<div className="mt-4 space-y-2">{valid.map((reward) => <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3" key={reward.id}><span className="text-sm font-semibold">{reward.name} · {reward.pointsRequired}{' '}{uiText("pts")}</span><Button className="px-3 py-2" disabled={Number(member.pointsBalance) < Number(reward.pointsRequired)} isLoading={busy === reward.id} onClick={() => redeem(reward)} variant="secondary">{uiText("Redeem")}</Button></div>)}{valid.length === 0 && <p className="text-sm text-slate-500">{uiText("No rewards are currently redeemable.")}</p>}</div></section>
}
export default RewardRedemption
