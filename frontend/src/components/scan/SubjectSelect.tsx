import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import SubjectCropper from './SubjectCropper'
import { detectSubject } from '@/lib/api'
import { cropImageToBox } from '@/lib/imageCrop'
import type { SubjectBox } from '@/lib/types'

const SLOT_LABELS = ['Front', 'Side', 'Top', 'Angle']
const FULL_BOX: SubjectBox = { x: 0, y: 0, w: 1, h: 1, confident: false }
const DEFAULT_BOX: SubjectBox = { x: 0.2, y: 0.2, w: 0.6, h: 0.6, confident: false }

// "Confirm your object" step: shows each uploaded photo with a suggested crop
// box the user adjusts, so Meshy models just the object — not the hand holding
// it or the background. Crops client-side, then hands the cropped files back.
export default function SubjectSelect({
  files,
  onConfirm,
  onBack,
  busy,
}: {
  files: File[]
  onConfirm: (cropped: File[]) => void
  onBack: () => void
  busy?: boolean
}) {
  const [urls, setUrls] = useState<string[]>([])
  const [boxes, setBoxes] = useState<SubjectBox[]>(() => files.map(() => DEFAULT_BOX))
  const [ready, setReady] = useState(false)
  const [cropping, setCropping] = useState(false)

  useEffect(() => {
    const objectUrls = files.map((file) => URL.createObjectURL(file))
    setUrls(objectUrls)
    // Ask the backend where each object probably is, to pre-place each box.
    Promise.all(files.map((file) => detectSubject(file).catch(() => DEFAULT_BOX))).then((suggested) => {
      setBoxes(suggested)
      setReady(true)
    })
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    setCropping(true)
    try {
      const cropped = await Promise.all(files.map((file, index) => cropImageToBox(file, boxes[index])))
      onConfirm(cropped)
    } finally {
      setCropping(false)
    }
  }

  const disabled = busy || cropping || !ready

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div>
        <p className="font-display text-[11px] tracking-[0.16em] text-primary uppercase">Confirm your object</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll model only what's inside each box. Drag it around just the object you want — leave your hand and the
          background outside, or press "Use whole photo".
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {urls.map((url, index) => (
          <div key={url} className="flex flex-col gap-1.5">
            <SubjectCropper
              src={url}
              box={boxes[index]}
              label={SLOT_LABELS[index]}
              onChange={(next) => setBoxes((prev) => prev.map((box, i) => (i === index ? next : box)))}
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setBoxes((prev) => prev.map((box, i) => (i === index ? FULL_BOX : box)))}
              >
                Use whole photo
              </button>
              {ready && !boxes[index].confident && <span>· couldn't auto-detect — drag the box to your object</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy || cropping}>
          Back
        </Button>
        <Button variant="warm" size="sm" onClick={generate} disabled={disabled}>
          {cropping ? 'Preparing…' : 'Generate from selection'}
        </Button>
      </div>
    </div>
  )
}
