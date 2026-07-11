import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ModelViewer from './ModelViewer'
import {
  ApiError,
  getAnimationStatus,
  getRigStatus,
  listAnimationPresets,
  startAnimation,
  startRigging,
} from '@/lib/api'
import type { AnimationPreset, ErrorDetail } from '@/lib/types'

const POLL_MS = 2000

export default function CharacterRig({ jobId }: { jobId: string }) {
  const [phase, setPhase] = useState<'idle' | 'rigging' | 'ready' | 'animating'>('idle')
  const [rigId, setRigId] = useState<string | null>(null)
  const [riggedUrl, setRiggedUrl] = useState<string | null>(null)
  const [animatedUrl, setAnimatedUrl] = useState<string | null>(null)
  const [presets, setPresets] = useState<AnimationPreset[]>([])
  const [error, setError] = useState<ErrorDetail | null>(null)
  const pollHandle = useRef<number | null>(null)

  useEffect(() => {
    listAnimationPresets()
      .then(setPresets)
      .catch(() => {})
    return () => {
      if (pollHandle.current !== null) clearInterval(pollHandle.current)
    }
  }, [])

  async function beginRig() {
    setPhase('rigging')
    setError(null)
    try {
      const { rig_id: newRigId } = await startRigging(jobId)
      setRigId(newRigId)

      pollHandle.current = window.setInterval(async () => {
        try {
          const record = await getRigStatus(newRigId)
          if (record.status === 'succeeded') {
            clearInterval(pollHandle.current!)
            setRiggedUrl(record.rigged_model_url)
            setPhase('ready')
          } else if (record.status === 'failed') {
            clearInterval(pollHandle.current!)
            setError(record.error)
            setPhase('idle')
          }
        } catch (err) {
          clearInterval(pollHandle.current!)
          setError(err instanceof ApiError ? err.detail : null)
          setPhase('idle')
        }
      }, POLL_MS)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : null)
      setPhase('idle')
    }
  }

  async function applyPreset(actionId: number) {
    if (!rigId) return
    setPhase('animating')
    setError(null)
    try {
      const { animation_id } = await startAnimation(rigId, actionId)

      pollHandle.current = window.setInterval(async () => {
        try {
          const record = await getAnimationStatus(animation_id)
          if (record.status === 'succeeded') {
            clearInterval(pollHandle.current!)
            setAnimatedUrl(record.animation_url)
            setPhase('ready')
          } else if (record.status === 'failed') {
            clearInterval(pollHandle.current!)
            setError(record.error)
            setPhase('ready')
          }
        } catch (err) {
          clearInterval(pollHandle.current!)
          setError(err instanceof ApiError ? err.detail : null)
          setPhase('ready')
        }
      }, POLL_MS)
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : null)
      setPhase('ready')
    }
  }

  if (phase === 'idle' && !riggedUrl) {
    return (
      <Card className="gap-2 p-4">
        <p className="text-sm font-medium">Is this a character?</p>
        <p className="text-xs text-muted-foreground">
          Rigging only works on humanoid or quadruped shapes with clear limbs — not everyday objects. Costs
          real Meshy credits and may be rejected if this scan isn't character-shaped.
        </p>
        <Button variant="outline" size="sm" className="mt-1 w-fit" onClick={beginRig}>
          Try rigging as a character
        </Button>
        {error && <p className="mt-1 text-xs text-brand-coral">{error.human_message}</p>}
      </Card>
    )
  }

  return (
    <Card className="gap-3 p-4">
      {phase === 'rigging' && <p className="text-sm text-muted-foreground">Rigging a skeleton onto this model…</p>}

      {(riggedUrl || animatedUrl) && (
        <ModelViewer modelUrl={animatedUrl ?? riggedUrl!} />
      )}

      {riggedUrl && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.action_id}
              type="button"
              onClick={() => applyPreset(preset.action_id)}
              disabled={phase === 'animating'}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {phase === 'animating' && <p className="text-xs text-muted-foreground">Applying animation…</p>}
      {error && <p className="text-xs text-brand-coral">{error.human_message}</p>}
    </Card>
  )
}
