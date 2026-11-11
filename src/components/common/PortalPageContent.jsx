import { Suspense } from 'react'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import PageErrorBoundary from './PageErrorBoundary'

function PortalPageLoading() {
  const { t } = useCustomerLanguage()
  return <section role="status" aria-live="polite" className="min-h-64 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
    <p className="text-sm font-medium text-slate-500">{t('Loading page…')}</p>
    <div aria-hidden="true" className="mt-5 space-y-4 motion-safe:animate-pulse">
      <div className="h-7 w-40 rounded-lg bg-slate-100" />
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="h-4 w-2/3 rounded bg-slate-100" />
    </div>
  </section>
}

export default function PortalPageContent({ children }) {
  // Lazy pages and page-render errors must not replace the header/navigation.
  return <PageErrorBoundary><Suspense fallback={<PortalPageLoading />}>{children}</Suspense></PageErrorBoundary>
}
