import { createContext } from 'react'

export const ShopSettingsContext = createContext({ name: 'DineOS', isLoading: true, error: '', refresh: async () => {}, saveName: async () => { throw new Error('Shop settings provider is unavailable.') } })
