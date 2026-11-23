import useShopSettings from '../../hooks/useShopSettings'
import useCustomerLanguage from '../../hooks/useCustomerLanguage'
import StatePanel from '../common/StatePanel'

export default function MembershipFeatureGate({ children }) {
  const { config, isLoading, error } = useShopSettings()
  const { t } = useCustomerLanguage()
  if (isLoading || error || config?.membershipEnabled !== true) return <StatePanel title={t('Membership and rewards')} description={t('Membership and rewards are currently paused. You can still order as Guest.')} />
  return children
}
