import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ErrorDetail } from '@/lib/types'

export default function ErrorCard({ error, onRetry }: { error: ErrorDetail; onRetry: () => void }) {
  return (
    <Card className="border-coral/40 bg-coral/5">
      <CardHeader>
        <CardTitle className="text-coral">Something went wrong</CardTitle>
        <CardDescription className="text-slate-300">{error.human_message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-slate-400">{error.suggested_action}</p>
        <Button variant="outline" onClick={onRetry} className="self-start">
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}
