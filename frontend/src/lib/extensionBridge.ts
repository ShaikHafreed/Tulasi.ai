/**
 * Stage B bridge: the browser extension's content script relays whitelisted
 * postMessage payloads here — it never scrapes the DOM or touches app state
 * directly. This listener is the only thing the extension can talk to; it
 * runs the exact same runAssistantTurn/confirmAction path as the in-app
 * ChatPanel, so behavior is identical whether the request came from the
 * page or the extension's side panel.
 */

import { confirmAction, runAssistantTurn } from './tulasiAssistant'
import type { ProposedAction } from './types'

const INBOUND_SOURCE = 'tulasi-extension'
const OUTBOUND_SOURCE = 'tulasi-app'

interface InboundMessage {
  source: typeof INBOUND_SOURCE
  requestId: string
  type: 'send_chat_message' | 'confirm_action'
  message?: string
  action?: ProposedAction
}

function isInboundMessage(data: unknown): data is InboundMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === INBOUND_SOURCE
}

export function installExtensionBridge(): void {
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !isInboundMessage(event.data)) return
    const data = event.data

    if (data.type === 'send_chat_message' && data.message) {
      try {
        const result = await runAssistantTurn(data.message)
        window.postMessage(
          { source: OUTBOUND_SOURCE, requestId: data.requestId, type: 'chat_reply', ...result },
          '*',
        )
      } catch {
        window.postMessage(
          {
            source: OUTBOUND_SOURCE,
            requestId: data.requestId,
            type: 'chat_error',
            message: 'Something went wrong reaching the assistant.',
          },
          '*',
        )
      }
      return
    }

    if (data.type === 'confirm_action' && data.action) {
      const result = confirmAction(data.action)
      window.postMessage(
        { source: OUTBOUND_SOURCE, requestId: data.requestId, type: 'action_confirmed', result },
        '*',
      )
    }
  })
}
