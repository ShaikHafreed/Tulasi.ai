import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sendAssistantFeedback } from '@/lib/api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  status?: string
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const [rated, setRated] = useState<'up' | 'down' | null>(null)
  const isUser = message.role === 'user'

  async function rate(rating: 'up' | 'down') {
    setRated(rating)
    try {
      await sendAssistantFeedback(message.text, rating)
    } catch {
      // Feedback failing shouldn't interrupt the conversation.
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
      {message.status && <p className="font-display text-[11px] text-primary">{message.status}</p>}
      {!isUser && (
        <div className="flex gap-1 px-1">
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
