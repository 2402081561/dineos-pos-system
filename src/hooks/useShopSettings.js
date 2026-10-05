import { useContext } from 'react'
import { ShopSettingsContext } from '../context/ShopSettingsContext'

export default function useShopSettings() {
  return useContext(ShopSettingsContext)
}
