import { useState } from 'react'
import { Loader2, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendAssistantFeedback } from '@/lib/api'
import { playSpokenText } from '@/lib/voicePlayback'
import { getVoiceEnabled } from '@/lib/voicePreference'
import type { Source } from '@/lib/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  status?: string
  sources?: Source[]
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const [rated, setRated] = useState<'up' | 'down' | null>(null)
  const [playing, setPlaying] = useState(false)
  const isUser = message.role === 'user'

  async function rate(rating: 'up' | 'down') {
    setRated(rating)
    try {
      await sendAssistantFeedback(message.text, rating)
    } catch {
      // Feedback failing shouldn't interrupt the conversation.
    }
  }

  async function listen() {
    if (playing) return
    setPlaying(true)
    try {
      await playSpokenText(message.text)
    } catch {
      // Silently fail — the caption is always visible either way.
    } finally {
      setPlaying(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-primary/15 text-foreground' : 'bg-secondary text-foreground',
        )}
      >
        {message.text}
      </div>
      {!isUser && !!message.sources?.length && (
        <div className="flex max-w-[85%] flex-wrap gap-1.5 px-1">
          {message.sources.map((source) => (
            <a
              key={source.url + source.title}
              href={source.url.startsWith('http') ? source.url : undefined}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors',
                source.url.startsWith('http') && 'hover:border-primary/50 hover:text-primary',
              )}
            >
              {source.title}
            </a>
          ))}
        </div>
      )}
      {message.status && <p className="font-display text-[11px] text-primary">{message.status}</p>}
      {!isUser && (
        <div className="flex gap-1 px-1">
          {getVoiceEnabled() && (
            <button
              type="button"
              onClick={listen}
              disabled={playing}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
              aria-label="Listen"
            >
              {playing ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => rate('up')}
            className={cn(
              'rounded p-1 text-muted-foreground transition-colors hover:text-primary',
              rated === 'up' && 'text-primary',
            )}
            aria-label="Good reply"
          >
            <ThumbsUp size={12} />
          </button>
          <button
            type="button"
            onClick={() => rate('down')}
            className={cn(
              'rounded p-1 text-muted-foreground transition-colors hover:text-brand-coral',
              rated === 'down' && 'text-brand-coral',
            )}
            aria-label="Bad reply"
          >
            <ThumbsDown size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
