import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FileImage, Ruler, ScanLine, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_BYTES = 100 * 1024 * 1024

const CARD_ICONS = [
  { Icon: FileImage, rotate: -14, x: -22 },
  { Icon: Ruler, rotate: 0, x: 0 },
  { Icon: ScanLine, rotate: 14, x: 22 },
]

export default function UploadZone({
  onFileSelected,
  onValidationError,
  disabled,
}: {
  onFileSelected: (file: File) => void
  onValidationError: (message: string) => void
  disabled?: boolean
}) {
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
        onValidationError('That photo is too large — keep it under 100MB.')
        return
      }
      onFileSelected(file)
    },
    [onFileSelected, onValidationError],
  )

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
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-10 text-center transition-colors',
        isDragging && 'border-primary bg-primary/5',
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
      <motion.div
        className="relative flex h-16 items-center justify-center"
        initial="rest"
        whileHover="hover"
        animate={isDragging ? 'hover' : 'rest'}
      >
        {CARD_ICONS.map(({ Icon, rotate, x }, i) => (
          <motion.div
            key={i}
            className="absolute flex size-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm"
            style={{ zIndex: i === 1 ? 2 : 1 }}
            variants={{
              rest: { rotate: 0, x: 0, y: 0, opacity: i === 1 ? 1 : 0 },
              hover: { rotate, x, y: -4, opacity: 1 },
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Icon size={18} />
          </motion.div>
        ))}
      </motion.div>

      <p className="text-sm text-muted-foreground">Drag a photo here, or</p>
      <Button type="button" variant="warm" onClick={() => inputRef.current?.click()}>
        <Upload size={15} />
        Choose a photo
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(event) => validateAndSelect(event.target.files?.[0])}
      />
      <p className="text-xs text-muted-foreground">JPEG or PNG, under 100MB</p>
    </div>
  )
}
