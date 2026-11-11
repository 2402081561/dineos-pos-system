import { joinCustomerTable, leaveCustomerSession, updateCustomerNickname } from './customerApi'

export async function joinTableSession({ customerNickname, tableNumber, newVisit }) { return joinCustomerTable(tableNumber, customerNickname, newVisit) }
export async function updateTableSessionParticipant({ customerNickname, sessionId }) { return updateCustomerNickname(sessionId, customerNickname) }
export async function leaveTableSession({ sessionId }) { if (sessionId) await leaveCustomerSession(sessionId) }
export function subscribeToTableSession(_tableSessionId, onSessionUpdate) { onSessionUpdate({ status: 'active' }); return () => {} }
