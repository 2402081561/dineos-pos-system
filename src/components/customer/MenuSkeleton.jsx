function MenuSkeleton({ compact = false }) {
  if (compact) return <div aria-busy="true" className="space-y-4">{Array.from({ length: 4 }, (_, index) => <div className="mobile-menu-item" key={index}><div className="aspect-square animate-pulse rounded-xl bg-slate-100"/><div className="space-y-2"><div className="skeleton h-4 w-full"/><div className="skeleton h-4 w-2/3"/></div><div className="skeleton col-span-2 h-9 w-full"/></div>)}</div>
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div className="surface-card overflow-hidden" key={index}><div className="h-44 animate-pulse bg-slate-200" /><div className="space-y-3 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /><div className="h-3 w-full animate-pulse rounded bg-slate-100" /><div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" /><div className="mt-5 h-8 animate-pulse rounded bg-slate-100" /></div></div>)}</div>
}

export default MenuSkeleton
