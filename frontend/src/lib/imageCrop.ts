import type { SubjectBox } from './types'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Crops `file` to the normalised box and returns a new JPEG File. Used to
// isolate just the chosen object before it's sent to Meshy, so the hand /
// background around it isn't modelled.
export async function cropImageToBox(file: File, box: SubjectBox): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const sx = Math.max(0, Math.round(box.x * img.width))
    const sy = Math.max(0, Math.round(box.y * img.height))
    const sw = Math.max(1, Math.round(box.w * img.width))
    const sh = Math.max(1, Math.round(box.h * img.height))

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return file
    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}_crop.jpg`, { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}
