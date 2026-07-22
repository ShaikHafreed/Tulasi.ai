import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import SubjectCropper from './SubjectCropper'
import { recognizeObjects } from '@/lib/api'
import { cropImageToBox } from '@/lib/imageCrop'
import type { RecognizedObject, SubjectBox } from '@/lib/types'

const SLOT_LABELS = ['Front', 'Side', 'Top', 'Angle']
const FULL_BOX: SubjectBox = { x: 0, y: 0, w: 1, h: 1, confident: false }

// Between Upload and Generate: recognises the object(s) in the primary photo,
// asks the user to confirm/pick which one to model, lets them fine-tune the
// crop, then crops every photo to that region (so Meshy models the object, not
// the hand/background). Recognition runs on the primary photo only; the chosen
// box is applied proportionally to the other angles.
export default function ObjectRecognitionStep({
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
  const [primaryUrl, setPrimaryUrl] = useState<string>('')
  const [objects, setObjects] = useState<RecognizedObject[] | null>(null)
  const [selected, setSelected] = useState(0)
  const [box, setBox] = useState<SubjectBox>(FULL_BOX)
  const [adjusting, setAdjusting] = useState(false)
  const [cropping, setCropping] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(files[0])
    setPrimaryUrl(url)
    recognizeObjects(files[0])
      .then((res) => {
        const found = res.objects.length ? res.objects : [{ label: null, description: null, box: FULL_BOX, confidence: 0 }]
        setObjects(found)
        setSelected(0)
        setBox(found[0].box)
      })
      .catch(() => {
        const fallback: RecognizedObject = { label: null, description: null, box: { x: 0.2, y: 0.2, w: 0.6, h: 0.6, confident: false }, confidence: 0 }
        setObjects([fallback])
        setBox(fallback.box)
      })
    return () => URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pick(index: number) {
    setSelected(index)
    if (objects) setBox(objects[index].box)
  }

  async function generate() {
    setCropping(true)
    try {
      const cropped = await Promise.all(files.map((file) => cropImageToBox(file, box)))
      onConfirm(cropped)
    } finally {
      setCropping(false)
    }
  }

  if (!objects) {
    return (
      <div className="flex max-w-md items-center gap-3 text-sm text-muted-foreground">
        <span className="size-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        Recognizing what's in your photo…
      </div>
    )
  }

  const current = objects[selected]
  const multiple = objects.length > 1
  const confidentLabel = current.label && current.confidence > 0.6
  const disabled = busy || cropping

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] text-teal uppercase">confirm your object</p>
        <h2 className="mt-1 font-display text-2xl leading-tight">
          {multiple ? (
            <>
              We found a few things — <span className="italic text-muted-foreground">which one?</span>
            </>
          ) : confidentLabel ? (
            <>
              We think this is a <span className="text-teal">{current.label}</span>.
            </>
          ) : (
            <>
              Frame just your <span className="italic text-muted-foreground">object.</span>
            </>
          )}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {confidentLabel
            ? "Build this as your 3D model, or adjust the box if we've framed it wrong."
            : "We couldn't confidently identify it — drag the box around just the object (leave your hand and the background outside)."}
        </p>
      </div>

      {multiple && (
        <div className="flex flex-wrap gap-2">
          {objects.map((obj, index) => (
            <button
              key={index}
              type="button"
              onClick={() => pick(index)}
              className={`border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors ${
                index === selected ? 'border-teal bg-teal/10 text-teal' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {obj.label ?? `object ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {adjusting ? (
        <SubjectCropper src={primaryUrl} box={box} label={SLOT_LABELS[0]} onChange={setBox} />
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border">
          <img src={primaryUrl} alt="your object" className="block w-full" />
          <div
            className="pointer-events-none absolute border-2 border-teal"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={disabled}>
          Back
        </Button>
        <button
          type="button"
          onClick={() => setAdjusting((v) => !v)}
          disabled={disabled}
          className="border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase hover:text-foreground disabled:opacity-50"
        >
          {adjusting ? 'done adjusting' : 'adjust box'}
        </button>
        <button
          type="button"
          onClick={() => setBox(FULL_BOX)}
          disabled={disabled}
          className="border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase hover:text-foreground disabled:opacity-50"
        >
          whole photo
        </button>
        <Button variant="warm" size="sm" onClick={generate} disabled={disabled}>
          {cropping ? 'Preparing…' : 'Build this →'}
        </Button>
      </div>
    </div>
  )
}
