import { useCallback, useEffect, useState } from 'react'

// Single source of truth for unit display. Dimensions are ALWAYS stored and
// computed in millimetres internally — only this module converts for the
// display layer, so there's no rounding-error drift from round-tripping
// through inches.

export type Unit = 'mm' | 'inch'

const STORAGE_KEY = 'tulasi_unit'
const UNIT_CHANGE_EVENT = 'tulasi-unit-change'
const MM_PER_INCH = 25.4

export function getUnit(): Unit {
  return localStorage.getItem(STORAGE_KEY) === 'inch' ? 'inch' : 'mm'
}

export function setUnit(unit: Unit): void {
  localStorage.setItem(STORAGE_KEY, unit)
  // Notify every mounted consumer (DimensionPanel, Settings, detail views)
  // in this tab; the native `storage` event only fires in *other* tabs.
  window.dispatchEvent(new CustomEvent(UNIT_CHANGE_EVENT))
}

export function unitLabel(unit: Unit): string {
  return unit === 'inch' ? 'in' : 'mm'
}

// mm → display number in the given unit.
export function mmToUnit(mm: number, unit: Unit): number {
  return unit === 'inch' ? mm / MM_PER_INCH : mm
}

// display number in the given unit → mm (for storing edits).
export function unitToMm(value: number, unit: Unit): number {
  return unit === 'inch' ? value * MM_PER_INCH : value
}

// Rounded display value suitable for a number input (more precision for the
// smaller inch magnitudes).
export function toDisplayValue(mm: number, unit: Unit): number {
  const v = mmToUnit(mm, unit)
  return unit === 'inch' ? Number(v.toFixed(3)) : Number(v.toFixed(1))
}

// Formatted "W × H × D unit" string for read-only dimension displays.
export function formatDimensions(
  width_mm: number,
  height_mm: number,
  depth_mm: number,
  unit: Unit,
): string {
  const f = (mm: number) => toDisplayValue(mm, unit).toFixed(unit === 'inch' ? 3 : 1)
  return `${f(width_mm)} × ${f(height_mm)} × ${f(depth_mm)} ${unitLabel(unit)}`
}

// React binding — re-renders on same-tab changes (custom event) and cross-tab
// changes (storage event). Returns [unit, setUnit].
export function useUnit(): [Unit, (unit: Unit) => void] {
  const [unit, setUnitState] = useState<Unit>(getUnit)

  useEffect(() => {
    const onChange = () => setUnitState(getUnit())
    window.addEventListener(UNIT_CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(UNIT_CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])

  const set = useCallback((next: Unit) => setUnit(next), [])
  return [unit, set]
}
