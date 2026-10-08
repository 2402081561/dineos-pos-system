import { createContext } from 'react'
import { defaultConfig } from '../../server/src/posRules'

export const ShopSettingsContext = createContext({ name: 'DineOS', config: defaultConfig, settings: { name: 'DineOS', config: defaultConfig, revision: 0, isAcceptingOrders: false }, isLoading: true, error: '', refresh: async () => {}, saveSettings: async () => { throw new Error('Shop settings provider is unavailable.') } })
