function OrderTrackingSkeleton() {
  return <div className="space-y-6 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="surface-card space-y-6 p-6"><div className="h-16 rounded-xl bg-orange-50" /><div className="space-y-7">{Array.from({ length: 4 }, (_, index) => <div className="flex gap-4" key={index}><div className="h-7 w-7 rounded-full bg-slate-200" /><div className="flex-1 space-y-2"><div className="h-4 w-28 rounded bg-slate-200" /><div className="h-3 w-3/4 rounded bg-slate-100" /></div></div>)}</div></div></div>
}

export default OrderTrackingSkeleton
