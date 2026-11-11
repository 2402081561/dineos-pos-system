import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AdminAuthProvider from './context/AdminAuthProvider'
import CartProvider from './context/CartProvider'
import CustomerSessionProvider from './context/CustomerSessionProvider'
import ToastProvider from './context/ToastProvider'
import ShopSettingsProvider from './context/ShopSettingsProvider'
import ToastViewport from './components/common/ToastViewport'
import './styles/index.css'
import './styles/portal-theme.css'
import CustomerLanguageProvider from './context/CustomerLanguageProvider'
import { AppErrorBoundary } from './components/common/PageErrorBoundary'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
    <CustomerLanguageProvider>
    <ShopSettingsProvider>
      <AdminAuthProvider>
        <ToastProvider>
          <CustomerSessionProvider>
            <CartProvider>
              <BrowserRouter>
                <App />
                <ToastViewport />
              </BrowserRouter>
            </CartProvider>
          </CustomerSessionProvider>
        </ToastProvider>
      </AdminAuthProvider>
    </ShopSettingsProvider>
    </CustomerLanguageProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
