function AdminDashboardSkeleton() {
  return <div className="space-y-7 animate-pulse"><div className="h-20 rounded-2xl bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="surface-card h-32 bg-white p-5" key={index}><div className="h-7 w-20 rounded bg-slate-200" /><div className="mt-4 h-4 w-3/4 rounded bg-slate-100" /></div>)}</div><div className="grid gap-6 lg:grid-cols-2"><div className="surface-card h-72 bg-white" /><div className="surface-card h-72 bg-white" /></div></div>
}

export default AdminDashboardSkeleton
