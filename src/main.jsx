import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AuthProvider from './context/AuthProvider'
import CartProvider from './context/CartProvider'
import CustomerSessionProvider from './context/CustomerSessionProvider'
import ToastProvider from './context/ToastProvider'
import ToastViewport from './components/common/ToastViewport'
import './services/firebase'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
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
    </AuthProvider>
  </StrictMode>,
)
