import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Radio, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { confirmAction, runAssistantTurn } from '@/lib/tulasiAssistant'
import { getRecentEvents, onEvent, pushEvent, type TulasiEvent, type TulasiEventType } from '@/lib/tulasiEvents'
import { SectionHeader } from '../tulasi/Readout'
import { cn } from '@/lib/utils'
import { playSpokenText } from '@/lib/voicePlayback'
import { getVoiceEnabled } from '@/lib/voicePreference'
import type { ProposedAction } from '@/lib/types'
import type { PrintCheckResult } from '@/lib/tulasiCommands'
import MessageBubble, { type ChatMessage } from './MessageBubble'
import ActionConfirmCard from './ActionConfirmCard'

function speak(text: string): void {
  if (!text || !getVoiceEnabled()) return
  // Best-effort auto-play — browsers often block audio that isn't a direct
  // result of a click, so this can silently fail. MessageBubble's manual
  // "listen" button is the reliable fallback, not an alternative path.
  void playSpokenText(text).catch(() => {})
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: "I can resize your scanned model to a target measurement, check it against print heuristics, rotate the view, or export it. What are you trying to do?",
}

const SUGGESTED_PROMPT = 'What have I done so far?'

// Matches backend/app/services/assistant.py's LIVE_OBSERVE_PREFIX — an
// internal marker so the mock/real assistant can tell "the user typed this"
// apart from "this happened on screen and live mode is reacting to it".
const LIVE_OBSERVE_PREFIX = '__live_observe__:'

// Only events genuinely caused by the user get a proactive reaction.
// print_check_run/export_requested are themselves *results* of an assistant
// action, so reacting to those would just have the assistant talk to itself.
const LIVE_REACTION_EVENTS = new Set<TulasiEventType>(['scan_started', 'reference_detected'])
const DIMENSIONS_DEBOUNCE_MS = 1500

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

const SIZE_STORAGE_KEY = 'tulasi_chat_panel_size'
const DEFAULT_SIZE = { width: 360, height: 560 }
const MIN_SIZE = { width: 300, height: 380 }
const MAX_SIZE = { width: 640, height: 860 }

function loadPanelSize(): { width: number; height: number } {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY)
    if (!raw) return DEFAULT_SIZE
    const parsed = JSON.parse(raw)
    return {
      width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, parsed.width)),
      height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, parsed.height)),
    }
  } catch {
    return DEFAULT_SIZE
  }
}

export default function ChatPanel({ embedded }: { embedded?: boolean }) {
  const [open, setOpen] = useState(false)
  const [recentEvents, setRecentEvents] = useState<TulasiEvent[]>(getRecentEvents)
  const [liveMode, setLiveMode] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [pendingAction, setPendingAction] = useState<{ forMessageId: string; action: ProposedAction } | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [panelSize, setPanelSize] = useState(loadPanelSize)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dimensionsDebounce = useRef<number | null>(null)
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null)

  const startResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      resizeStart.current = { x: event.clientX, y: event.clientY, ...panelSize }

      function onMove(moveEvent: PointerEvent) {
        if (!resizeStart.current) return
        const dx = resizeStart.current.x - moveEvent.clientX
        const dy = resizeStart.current.y - moveEvent.clientY
        const next = {
          width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, resizeStart.current.width + dx)),
          height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, resizeStart.current.height + dy)),
        }
        setPanelSize(next)
      }

      function onUp() {
        resizeStart.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setPanelSize((current) => {
          localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(current))
          return current
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [panelSize],
  )

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  const runTurn = useCallback(
    async (text: string, { showUserBubble }: { showUserBubble: boolean }) => {
      if (showUserBubble) {
        setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }])
      }
      setSending(true)
      scrollToBottom()

      try {
        const { reply, executed, pendingConfirm, sources } = await runAssistantTurn(text)
        if (reply) {
          const replyId = nextId()
          setMessages((prev) => [...prev, { id: replyId, role: 'assistant', text: reply, sources }])
          speak(reply)
          for (const action of pendingConfirm) {
            setPendingAction({ forMessageId: replyId, action })
          }
        }
        for (const { action, result } of executed) {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: '', status: describeAction(action, result) },
          ])
        }
      } catch {
        if (showUserBubble) {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: 'assistant', text: 'Something went wrong reaching the assistant — try again.' },
          ])
        }
      } finally {
        setSending(false)
        scrollToBottom()
      }
    },
    [scrollToBottom],
  )

  // Real recent-activity feed for the embedded (full-page) layout — the
  // actual event bus, not fabricated "recent ops" numbers.
  useEffect(() => {
    return onEvent((event) => setRecentEvents((prev) => [...prev, event].slice(-30)))
  }, [])

  // Live mode: react to the event bus in real time instead of waiting for
  // the user to type. Scoped to this page by construction — the event bus
  // is in-memory React state with no cross-tab/cross-site visibility at all.
  useEffect(() => {
    if (!liveMode) return

    const unsubscribe = onEvent((event) => {
      if (document.visibilityState !== 'visible') return

      if (event.type === 'dimensions_changed') {
        if (dimensionsDebounce.current) window.clearTimeout(dimensionsDebounce.current)
        dimensionsDebounce.current = window.setTimeout(() => {
          runTurn(LIVE_OBSERVE_PREFIX + event.type, { showUserBubble: false })
        }, DIMENSIONS_DEBOUNCE_MS)
        return
      }

      if (LIVE_REACTION_EVENTS.has(event.type)) {
        runTurn(LIVE_OBSERVE_PREFIX + event.type, { showUserBubble: false })
      }
    })

    return () => {
      unsubscribe()
      if (dimensionsDebounce.current) window.clearTimeout(dimensionsDebounce.current)
    }
  }, [liveMode, runTurn])

  function toggleLiveMode(next: boolean) {
    setLiveMode(next)
    pushEvent(next ? 'live_mode_enabled' : 'live_mode_disabled')
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'assistant',
        text: next
          ? "Live mode on — I'll watch what you do here and jump in when there's something worth flagging."
          : 'Live mode off.',
      },
    ])
  }

  function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    runTurn(text, { showUserBubble: true })
  }

  function confirmPendingAction() {
    if (!pendingAction) return
    const result = confirmAction(pendingAction.action)
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'assistant', text: '', status: describeAction(pendingAction.action, result) },
    ])
    setPendingAction(null)
  }

  if (!open && !embedded) {
    return (
      <>
        {liveMode && <div className="live-mode-frame" />}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="warm"
              size="icon"
              className="fixed right-4 bottom-20 z-20 size-12 rounded-full sm:right-6 md:bottom-6"
              onClick={() => setOpen(true)}
              aria-label="Open Tulasi assistant"
            >
              <MessageCircle size={20} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Ask Tulasi</TooltipContent>
        </Tooltip>
      </>
    )
  }

  const chatCard = (
    <Card
      className={
        embedded
          ? 'liquid-glass relative flex h-[min(720px,calc(100vh-260px))] w-full flex-col gap-0 overflow-hidden p-0'
          : 'liquid-glass fixed right-4 bottom-20 z-20 flex flex-col gap-0 overflow-hidden p-0 sm:right-6 md:bottom-6'
      }
      style={embedded ? undefined : { width: panelSize.width, height: panelSize.height }}
    >
      {!embedded && (
        <div
          onPointerDown={startResize}
          className="absolute top-0 left-0 z-10 size-4 cursor-nwse-resize touch-none"
          aria-hidden="true"
        >
          <div className="absolute top-1.5 left-1.5 size-2 rounded-full border-t border-l border-muted-foreground/50" />
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <p className="font-display text-xs tracking-[0.1em] text-primary uppercase">Tulasi assistant</p>
          {liveMode && (
            <span className="flex items-center gap-1 font-display text-[10px] tracking-[0.08em] text-brand-coral uppercase">
              <Radio size={11} className="animate-live-pulse" />
              Live
            </span>
          )}
        </div>
        {!embedded && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close assistant"
            >
              <X size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="text-xs text-muted-foreground">Watch my actions live</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Switch checked={liveMode} onCheckedChange={toggleLiveMode} aria-label="Toggle live mode" />
          </TooltipTrigger>
          <TooltipContent>Proactively react to what you're doing, without waiting for a message</TooltipContent>
        </Tooltip>
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

      <div className="border-t border-border px-3 pt-2.5">
        <button
          type="button"
          onClick={() => runTurn(SUGGESTED_PROMPT, { showUserBubble: true })}
          disabled={sending}
          className={cn(
            'rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground',
            'transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50',
          )}
        >
          {SUGGESTED_PROMPT}
        </button>
      </div>

      <div className="flex items-center gap-2 p-3">
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

  if (embedded) {
    return (
      <div className="mx-auto max-w-[1120px] px-4 pt-20 pb-20 sm:px-8 md:pb-12">
        {liveMode && <div className="live-mode-frame" />}
        <SectionHeader
          code="03 · assistant"
          title={
            <>
              Speak in intent. <span className="italic text-muted-foreground">It edits the geometry.</span>
            </>
          }
          hint="Every change goes through the same whitelisted commands as gesture control — reversible actions run instantly, others wait for your confirm."
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          {chatCard}
          <div className="clay h-fit">
            <div className="border-b border-border px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">
              recent activity
            </div>
            {recentEvents.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Nothing yet this session.</p>
            ) : (
              <ul className="max-h-[500px] overflow-y-auto">
                {[...recentEvents]
                  .reverse()
                  .map((event, i) => (
                    <li key={`${event.at}-${i}`} className="border-b border-border/50 px-4 py-2.5 last:border-0">
                      <div className="font-mono text-[10px] tracking-[0.15em] text-teal uppercase">
                        {event.type.replace(/_/g, ' ')}
                      </div>
                      <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                        {new Date(event.at).toLocaleTimeString()}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {liveMode && <div className="live-mode-frame" />}
      {chatCard}
    </>
  )
}
