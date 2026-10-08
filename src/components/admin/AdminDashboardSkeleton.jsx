function AdminDashboardSkeleton() {
  return <div aria-label="Loading dashboard" className="animate-pulse space-y-5"><div className="h-12 w-52 rounded-lg bg-slate-200" /><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-xl border border-slate-200 bg-white p-4"><div className="h-3 w-20 rounded bg-slate-100" /><div className="mt-3 h-6 w-24 rounded bg-slate-200" /></div>)}</div><div className="grid gap-5 xl:grid-cols-[1.7fr_1fr]"><div className="h-72 rounded-xl border border-slate-200 bg-white" /><div className="h-64 rounded-xl border border-slate-200 bg-white" /></div></div>
}

export default AdminDashboardSkeleton
