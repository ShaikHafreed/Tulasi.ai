import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ProposedAction } from '@/lib/types'

const ACTION_LABELS: Record<string, string> = {
  setDimensions: 'Resize the model',
  rotateView: 'Rotate the view',
  runPrintCheck: 'Run a print check',
  exportModel: 'Export the model file',
  addReferenceHint: 'Add a reference hint',
}

export default function ActionConfirmCard({
  action,
  onConfirm,
  onDismiss,
}: {
  action: ProposedAction
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <Card className="gap-2.5 border-brand-coral/30 p-4">
      <p className="text-sm font-medium">{ACTION_LABELS[action.action] ?? action.action}</p>
      <p className="font-display text-xs text-muted-foreground">
        {Object.entries(action.params)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' · ') || 'No parameters'}
      </p>
      <div className="flex gap-2">
        <Button variant="warm" size="sm" onClick={onConfirm}>
          Confirm
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Card>
  )
}
