import type { PrintCheckResult } from './tulasiCommands'

export const MIN_PRINTABLE_MM = 2
export const MAX_ASPECT_FOR_STABILITY = 4

export interface PrintCheckDimensions {
  width_mm: number
  height_mm: number
  depth_mm: number
}

// Real FDM-printing heuristics — shared by the New-scan flow's automatic
// check, the assistant's runPrintCheck command, and the standalone print
// check screen, so all three surfaces agree on the same numbers.
export function printCheck(dims: PrintCheckDimensions): PrintCheckResult {
  const warnings: string[] = []
  const values = [dims.width_mm, dims.height_mm, dims.depth_mm]
  const smallest = Math.min(...values)
  const largest = Math.max(...values)

  if (smallest < MIN_PRINTABLE_MM) {
    warnings.push(`Thinnest dimension is ${smallest.toFixed(1)}mm — features under ${MIN_PRINTABLE_MM}mm often fail on FDM printers.`)
  }
  if (largest / Math.max(smallest, 0.1) > MAX_ASPECT_FOR_STABILITY) {
    warnings.push('Tall and narrow relative to its base — may need a brim or raft for bed stability.')
  }

  return { passed: warnings.length === 0, warnings }
}
