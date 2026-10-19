import AppRoutes from './routes/AppRoutes'
import { Suspense } from 'react'
import PageErrorBoundary from './components/common/PageErrorBoundary'
import useCustomerLanguage from './hooks/useCustomerLanguage'

function App() {
  const { t } = useCustomerLanguage()
  return <PageErrorBoundary><Suspense fallback={<p role="status" className="p-6 text-center text-sm text-slate-500">{t('Loading page…')}</p>}><AppRoutes /></Suspense></PageErrorBoundary>
}

export default App
