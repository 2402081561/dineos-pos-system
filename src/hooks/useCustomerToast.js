import useCustomerLanguage from './useCustomerLanguage'
import useToast from './useToast'

export default function useCustomerToast() {
  const { t } = useCustomerLanguage()
  const toast = useToast()
  return {
    ...toast,
    showToast: (message, tone, options = {}) => toast.showToast(t(message), tone, {
      ...options,
      dismissLabel: t('Dismiss notification'),
      ...(options.action ? { action: { ...options.action, label: t(options.action.label) } } : {}),
    }),
  }
}
