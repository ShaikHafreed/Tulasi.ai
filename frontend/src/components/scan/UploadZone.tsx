import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_BYTES = 100 * 1024 * 1024

// Labeled angle slots. The first (Front) is the primary photo — required, and
// it drives calibration + the before/after slider. The rest are optional
// extra views Meshy uses for better multi-image geometry.
const SLOTS = ['Front', 'Side', 'Top', 'Angle'] as const

export default function UploadZone({
  onFilesSelected,
  onValidationError,
  disabled,
}: {
  onFilesSelected: (files: File[]) => void
  onValidationError: (message: string) => void
  disabled?: boolean
}) {
  const [files, setFiles] = useState<(File | null)[]>([null, null, null, null])
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null, null])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Revoke any object URLs still around when this component goes away.
  useEffect(() => {
    return () => {
      previews.forEach((url) => url && URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function validate(file: File): boolean {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      onValidationError('Only JPEG or PNG photos are supported.')
      return false
    }
    if (file.size > MAX_BYTES) {
      onValidationError('That photo is too large — keep it under 100MB.')
      return false
    }
    return true
  }

  function setSlot(index: number, file: File | null) {
    if (file && !validate(file)) return
    setFiles((prev) => {
      const next = [...prev]
      next[index] = file
      return next
    })
    setPreviews((prev) => {
      const next = [...prev]
      if (next[index]) URL.revokeObjectURL(next[index] as string)
      next[index] = file ? URL.createObjectURL(file) : null
      return next
    })
  }

  const chosen = files.filter((file): file is File => file !== null)

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 text-center">
        <motion.div
          className="size-6 rounded-full border-2 border-primary/25 border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
        />
        <p className="text-sm text-muted-foreground">Uploading…</p>
      </div>
    )
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SLOTS.map((label, index) => {
          const preview = previews[index]
          return (
            <div key={label} className="flex flex-col gap-1.5">
              <div
                className={cn(
                  'relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border transition-colors',
                  dragIndex === index && 'border-primary bg-primary/5',
                  preview && 'border-solid',
                )}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragIndex(index)
                }}
                onDragLeave={() => setDragIndex(null)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragIndex(null)
                  const file = event.dataTransfer.files?.[0]
                  if (file) setSlot(index, file)
                }}
              >
                {preview ? (
                  <>
                    <img src={preview} alt={label} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setSlot(index, null)}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white/90 hover:bg-black/80"
                      aria-label={`Remove ${label} photo`}
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRefs.current[index]?.click()}
                    className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Plus size={18} />
                    <span className="font-mono text-[10px] tracking-[0.15em] uppercase">{label}</span>
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputRefs.current[index] = el
                  }}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => setSlot(index, event.target.files?.[0] ?? null)}
                />
              </div>
              <span className="text-center font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
                {index === 0 ? 'required' : 'optional'}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Front photo required. Add up to 4 angles — more views give Meshy better geometry. JPEG or PNG, under 100MB.
      </p>

      <Button type="button" variant="warm" disabled={chosen.length === 0} onClick={() => onFilesSelected(chosen)} className="w-fit">
        <Upload size={15} />
        Generate 3D model ({chosen.length}/4)
      </Button>
    </div>
  )
}
