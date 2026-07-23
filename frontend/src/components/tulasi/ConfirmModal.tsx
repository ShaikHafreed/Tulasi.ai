import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// Warm confirmation modal for destructive actions. One shared component so
// cancel/confirm framing is consistent across delete scan, disable sharing,
// disconnect glove, etc.
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  tone = 'destructive',
  detail,
  busy,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  tone?: 'destructive' | 'primary'
  detail?: ReactNode
  busy?: boolean
}) {
  const isDestructive = tone === 'destructive'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md overflow-hidden p-0">
        <div className={`h-1 w-full ${isDestructive ? 'bg-coral' : 'bg-teal'}`} />
        <div className="p-6">
          <AlertDialogHeader className="space-y-2 text-left">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                  isDestructive ? 'bg-coral/15 text-coral' : 'bg-teal/15 text-teal'
                }`}
              >
                {isDestructive ? '!' : '?'}
              </span>
              <AlertDialogTitle className="font-display text-xl leading-tight">{title}</AlertDialogTitle>
            </div>
            {description && (
              <AlertDialogDescription className="pl-[42px] text-sm text-muted-foreground">
                {description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>

          {detail && <div className="mt-4 pl-[42px] font-mono text-[11px] text-muted-foreground">{detail}</div>}

          <AlertDialogFooter className="mt-6 gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={busy}
              className="h-10 rounded-full border border-border bg-transparent px-4 text-sm font-medium text-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              // No preventDefault — let Radix close the dialog through its own
              // supported flow (Action's default behavior) in the same click,
              // instead of gating the close behind the async onConfirm() work
              // finishing. Tying dialog lifecycle to a network round-trip is
              // what caused the delete option to sometimes need a page
              // refresh before it would respond again on other cards.
              onClick={() => onConfirm()}
              disabled={busy}
              className={`h-10 rounded-full px-4 text-sm font-medium transition-all disabled:opacity-50 ${
                isDestructive
                  ? 'bg-coral text-primary-foreground hover:bg-coral/90 active:scale-[0.98]'
                  : 'bg-teal text-primary-foreground hover:bg-teal/90 active:scale-[0.98]'
              }`}
            >
              {busy ? 'Working…' : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
