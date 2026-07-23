import { Toaster as Sonner, type ToasterProps } from 'sonner'

// Warm toast styling — wired to real actions only (scan saved, exported,
// link copied, sharing toggled, gesture connected/disconnected).
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'clay group toast font-sans text-sm text-foreground p-4 flex items-center gap-3',
          description: 'text-muted-foreground',
          actionButton: 'bg-teal text-primary-foreground rounded-full px-3 py-1 text-xs font-medium',
          cancelButton: 'bg-transparent text-muted-foreground text-xs',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
