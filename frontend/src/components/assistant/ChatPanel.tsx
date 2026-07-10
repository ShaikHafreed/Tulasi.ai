import { useCallback, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { sendAssistantMessage } from '@/lib/api'
import { getRecentEvents } from '@/lib/tulasiEvents'
import { executeCommand, isCommandAvailable } from '@/lib/tulasiCommands'
import type { ProposedAction } from '@/lib/types'
import type { PrintCheckResult } from '@/lib/tulasiCommands'
import MessageBubble, { type ChatMessage } from './MessageBubble'
import ActionConfirmCard from './ActionConfirmCard'

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: "I can resize your scanned model to a target measurement, check it against print heuristics, rotate the view, or export it. What are you trying to do?",
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `msg-${idCounter}`
}

function isPrintCheckResult(value: unknown): value is PrintCheckResult {
  return typeof value === 'object' && value !== null && 'passed' in value && 'warnings' in value
}

function describeAction(action: ProposedAction, result: unknown): string {
  if (action.action === 'runPrintCheck' && isPrintCheckResult(result)) {
    return result.passed
      ? 'Print check passed — no issues at these dimensions.'
      : `Print check flagged: ${result.warnings.join(' ')}`
  }
  const parts = Object.entries(action.params).map(([key, value]) => `${key}: ${value}`)
  return parts.length ? `Done — ${action.action} (${parts.join(', ')})` : `Done — ${action.action}`
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [pendingAction, setPendingAction] = useState<{ forMessageId: string; action: ProposedAction } | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    setInput('')
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])
    setSending(true)
    scrollToBottom()

    try {
      const reply = await sendAssistantMessage(text, getRecentEvents())
      const replyId = nextId()
      setMessages((prev) => [...prev, { id: replyId, role: 'assistant', text: reply.reply }])

      for (const action of reply.proposed_actions) {
        if (!isCommandAvailable(action.action)) continue

        if (action.reversible) {
          const result = executeCommand(action.action, action.params)
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: '', status: describeAction(action, result) },
          ])
        } else {
          setPendingAction({ forMessageId: replyId, action })
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', text: "Something went wrong reaching the assistant — try again." },
      ])
    } finally {
      setSending(false)
      scrollToBottom()
    }
  }

  function confirmPendingAction() {
    if (!pendingAction || !isCommandAvailable(pendingAction.action.action)) return
    const result = executeCommand(pendingAction.action.action, pendingAction.action.params)
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'assistant', text: '', status: describeAction(pendingAction.action, result) },
    ])
    setPendingAction(null)
  }

  if (!open) {
    return (
      <Button
        variant="warm"
        size="icon"
        className="fixed right-6 bottom-6 z-20 size-12 rounded-full"
        onClick={() => setOpen(true)}
        aria-label="Open Tulasi assistant"
      >
        <MessageCircle size={20} />
      </Button>
    )
  }

  return (
    <Card className="fixed right-6 bottom-6 z-20 flex h-[520px] w-[360px] flex-col gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-display text-xs tracking-[0.1em] text-primary uppercase">Tulasi assistant</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close assistant"
        >
          <X size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message) =>
          message.status ? (
            <p key={message.id} className="font-display text-[11px] text-primary">
              {message.status}
            </p>
          ) : (
            <MessageBubble key={message.id} message={message} />
          ),
        )}
        {pendingAction && (
          <ActionConfirmCard
            action={pendingAction.action}
            onConfirm={confirmPendingAction}
            onDismiss={() => setPendingAction(null)}
          />
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleSend()}
          placeholder="Describe what you want to do…"
          disabled={sending}
        />
        <Button variant="warm" size="icon" onClick={handleSend} disabled={sending} aria-label="Send">
          <Send size={16} />
        </Button>
      </div>
    </Card>
  )
}
