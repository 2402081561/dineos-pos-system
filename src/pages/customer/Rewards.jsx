import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/common/Button'
import SectionHeading from '../../components/common/SectionHeading'
import StatePanel from '../../components/common/StatePanel'
import PointsHistory from '../../components/member/PointsHistory'
import useCustomerSession from '../../hooks/useCustomerSession'
import { getPublicMenu, getPublicMember, getPublicRewards, redeemPublicReward } from '../../services/customerApi'

function Rewards() {
  const { session } = useCustomerSession(); const [member, setMember] = useState(null); const [rewards, setRewards] = useState([]); const [menuItems, setMenuItems] = useState([]); const [error, setError] = useState(''); const [selected, setSelected] = useState(null); const [result, setResult] = useState(null); const [isRedeeming, setIsRedeeming] = useState(false)
  useEffect(() => {
    let active = true
    if (!session?.sessionId || !session?.memberId) return () => { active = false }
    const load = async () => {
      try {
        const [nextMember, nextRewards, nextMenu] = await Promise.all([getPublicMember(session.sessionId), getPublicRewards(session.sessionId), getPublicMenu()])
        if (!active) return
        setMember(nextMember); setRewards(nextRewards); setMenuItems(nextMenu); setError('')
      } catch (loadError) { if (active) { console.error('[Rewards] Failed to load:', loadError); setError('We could not load rewards right now.') } }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [session?.memberId, session?.sessionId])
  const rows = useMemo(() => rewards.map((reward) => { const menu = menuItems.find((item) => item.id === reward.menuItemId); const points = Number.isInteger(Number(reward.pointsRequired)) && Number(reward.pointsRequired) > 0 ? Number(reward.pointsRequired) : 0; const reason = !reward.isAvailable ? 'This reward is unavailable.' : !menu ? 'This menu item is no longer available.' : menu.isAvailable !== true ? 'This menu item is sold out.' : !member || String(member.status ?? '').toLowerCase() !== 'active' ? 'Your membership is inactive.' : !points ? 'This reward has invalid points.' : Number(member.pointsBalance) < points ? 'Not enough points.' : ''; return { reward, menu, points, reason } }), [member, menuItems, rewards])
  async function confirm() { try { setIsRedeeming(true); setError(''); const next = await redeemPublicReward(session.sessionId, selected.reward.id); setResult(next); setSelected(null); setMember((current) => current ? { ...current, pointsBalance: next.pointsBalance } : current) } catch (apiError) { setError(apiError instanceof Error ? apiError.message : 'We could not redeem this reward.') } finally { setIsRedeeming(false) } }
  if (!session?.memberId) return <div className="mx-auto max-w-3xl"><StatePanel description="Join DineOS Membership during your table session to view and redeem rewards." title="Membership rewards are for members" /></div>
  return <div className="mx-auto max-w-3xl space-y-6"><SectionHeading description="Redeem available food and drink rewards using your DineOS points." eyebrow="Membership" title="Rewards" />{error && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}{result && <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-2xl">🎉</p><h2 className="mt-2 font-bold text-emerald-900">Redemption Successful!</h2><p className="mt-1 text-sm text-emerald-800">{result.rewardName} · -{result.pointsUsed} points</p><p className="mt-1 text-sm text-emerald-800">Remaining balance: {result.pointsBalance} points · {result.redemptionReference}</p></section>}<section className="rounded-3xl bg-slate-950 p-6 text-white"><p className="text-sm font-bold uppercase tracking-wide text-orange-300">Your points</p><p className="mt-1 text-4xl font-extrabold">{Math.max(0, Math.floor(Number(member?.pointsBalance) || 0))} pts</p></section><PointsHistory memberId={session.memberId} sessionId={session.sessionId} /><section className="space-y-4">{rows.length === 0 ? <StatePanel description="Please check back when rewards are configured." title="No rewards available" /> : rows.map(({ reward, menu, points, reason }) => <article className="flex gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm" key={reward.id}>{menu?.imageUrl && <img alt="" className="h-16 w-16 rounded-2xl object-cover" src={menu.imageUrl} />}<div className="min-w-0 flex-1"><h2 className="font-bold">{reward.name || menu?.name || 'Reward'}</h2><p className="mt-1 text-sm text-slate-500">{menu?.name || 'Menu item unavailable'} · {points || '—'} points</p>{reason && <p className="mt-2 text-xs font-semibold text-red-700">{reason}</p>}</div><Button disabled={Boolean(reason)} onClick={() => setSelected({ reward, points })} variant="secondary">Redeem</Button></article>)}</section>{selected && <div className="fixed inset-0 z-50 bg-slate-950/40 p-4"><section className="mx-auto mt-24 max-w-sm rounded-3xl bg-white p-6"><h2 className="text-xl font-bold">Confirm Redemption?</h2><p className="mt-3">{selected.reward.name}</p><p className="mt-1 text-sm text-slate-500">{selected.points} points will be deducted.</p><div className="mt-6 flex justify-end gap-3"><Button disabled={isRedeeming} onClick={() => setSelected(null)} variant="outline">Cancel</Button><Button isLoading={isRedeeming} onClick={confirm}>Redeem</Button></div></section></div>}</div>
}
export default Rewards
