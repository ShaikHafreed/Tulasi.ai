import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { askAssistant } from '@/lib/api'
import type { AssistantAction } from '@/lib/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  actions?: AssistantAction[]
}

export default function AssistantChat({
  jobId,
  onActions,
}: {
  jobId: string
  onActions: (actions: AssistantAction[]) => void
}) {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const message = input.trim()
    if (!message || pending) return

    setHistory((h) => [...h, { role: 'user', text: message }])
    setInput('')
    setPending(true)
    setError(null)

    try {
      const result = await askAssistant(jobId, message)
      setHistory((h) => [...h, { role: 'assistant', text: result.reply, actions: result.actions }])
      onActions(result.actions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The assistant is unavailable.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-sm font-medium text-slate-200">Ask the assistant</p>

      {history.length > 0 && (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {history.map((entry, index) => (
            <div key={index} className={entry.role === 'user' ? 'self-end text-right' : 'self-start'}>
              <p
                className={
                  entry.role === 'user'
                    ? 'inline-block rounded-lg bg-teal-400/15 px-3 py-1.5 text-sm text-teal-100'
                    : 'inline-block rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-200'
                }
              >
                {entry.text}
              </p>
              {entry.actions && entry.actions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {entry.actions.map((action, actionIndex) =>
                    action.type === 'export_ready' ? (
                      <a
                        key={actionIndex}
                        href={String(action.payload.url)}
                        download
                        className="rounded-full bg-teal-400/15 px-2 py-0.5 text-xs text-teal-300 underline"
                      >
                        Download {String(action.payload.format).toUpperCase()}
                      </a>
                    ) : (
                      <span
                        key={actionIndex}
                        className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400"
                      >
                        {action.type}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-coral">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && send()}
          placeholder="e.g. make this fit a 32mm pipe"
          disabled={pending}
          className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
        />
        <Button onClick={send} disabled={pending}>
          {pending ? 'Thinking…' : 'Send'}
        </Button>
      </div>
    </div>
  )
}
