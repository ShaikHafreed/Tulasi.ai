import { sendAssistantMessage } from './api'
import { getRecentEvents } from './tulasiEvents'
import { executeCommand, isCommandAvailable } from './tulasiCommands'
import { getAutoApplyReversible } from './assistantPreference'
import type { ProposedAction, Source } from './types'

export interface AssistantTurnResult {
  reply: string
  executed: { action: ProposedAction; result: unknown }[]
  pendingConfirm: ProposedAction[]
  sources: Source[]
}

// Shared by the in-app ChatPanel and the browser-extension bridge so both
// surfaces execute proposed actions identically — reversible actions run
// immediately, non-reversible ones come back for the caller to confirm.
export async function runAssistantTurn(message: string): Promise<AssistantTurnResult> {
  const reply = await sendAssistantMessage(message, getRecentEvents())
  const executed: { action: ProposedAction; result: unknown }[] = []
  const pendingConfirm: ProposedAction[] = []

  const autoApply = getAutoApplyReversible()
  for (const action of reply.proposed_actions) {
    if (!isCommandAvailable(action.action)) continue
    if (action.reversible && autoApply) {
      const result = executeCommand(action.action, action.params)
      executed.push({ action, result })
    } else {
      pendingConfirm.push(action)
    }
  }

  return { reply: reply.reply, executed, pendingConfirm, sources: reply.sources }
}

export function confirmAction(action: ProposedAction): unknown {
  if (!isCommandAvailable(action.action)) return undefined
  return executeCommand(action.action, action.params)
}
