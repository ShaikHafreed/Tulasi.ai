import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_BYTES = 10 * 1024 * 1024

interface UploadZoneProps {
  onFileSelected: (file: File) => void
  onValidationError: (message: string) => void
  disabled?: boolean
}

export default function UploadZone({ onFileSelected, onValidationError, disabled }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSelect = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!ACCEPTED_TYPES.includes(file.type)) {
        onValidationError('Only JPEG or PNG photos are supported.')
        return
      }
      if (file.size > MAX_BYTES) {
        onValidationError('That photo is too large — keep it under 10MB.')
        return
      }
      onFileSelected(file)
    },
    [onFileSelected, onValidationError],
  )

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
        isDragging ? 'border-teal-400 bg-teal-400/5' : 'border-slate-700',
        disabled && 'pointer-events-none opacity-50',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        validateAndSelect(event.dataTransfer.files?.[0])
      }}
    >
      <p className="text-sm text-slate-400">Drag a photo here, or</p>
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}>
        Choose a photo
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(event) => validateAndSelect(event.target.files?.[0])}
      />
      <p className="text-xs text-slate-500">JPEG or PNG, under 10MB</p>
    </div>
  )
}
