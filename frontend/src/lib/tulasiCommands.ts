export type CommandName =
  | 'setDimensions'
  | 'rotateView'
  | 'panView'
  | 'runPrintCheck'
  | 'exportModel'
  | 'addReferenceHint'
  | 'togglePresentation'
  | 'cameraFront'
  | 'cameraTop'
  | 'cameraSide'
  | 'cameraIso'

export interface SetDimensionsParams {
  width_mm: number
  height_mm: number
  depth_mm: number
}

export interface RotateViewParams {
  axis: 'x' | 'y'
  degrees: number
}

export interface PanViewParams {
  // Continuous 360° direction in degrees (standard math convention: 0 =
  // +X/right, 90 = +Y/up, image-space Y already flipped by the caller) —
  // supersedes the old 4-way up/down/left/right bucket.
  angleDeg: number
  magnitude: number
}

export interface ExportModelParams {
  format?: 'stl' | 'glb'
}

export interface AddReferenceHintParams {
  reference_type: 'card' | 'coin'
}

export interface PrintCheckResult {
  passed: boolean
  warnings: string[]
}

type CommandParams = {
  setDimensions: SetDimensionsParams
  rotateView: RotateViewParams
  panView: PanViewParams
  runPrintCheck: Record<string, never>
  exportModel: ExportModelParams
  addReferenceHint: AddReferenceHintParams
  togglePresentation: Record<string, never>
  cameraFront: Record<string, never>
  cameraTop:   Record<string, never>
  cameraSide:  Record<string, never>
  cameraIso:   Record<string, never>
}

type CommandHandlers = {
  [K in CommandName]?: (params: CommandParams[K]) => unknown
}

let handlers: CommandHandlers = {}

// The assistant only ever calls executeCommand with a whitelisted action name
// — it never touches app state directly. Components register handlers for
// whichever commands make sense in their current context.
export function registerCommandHandlers(next: CommandHandlers): void {
  handlers = { ...handlers, ...next }
}

export function clearCommandHandlers(): void {
  handlers = {}
}

export function isCommandAvailable(action: string): action is CommandName {
  return action in handlers && handlers[action as CommandName] !== undefined
}

export function executeCommand(action: CommandName, params: unknown): unknown {
  const handler = handlers[action]
  if (!handler) {
    throw new Error(`No handler registered for command "${action}"`)
  }
  return (handler as (params: unknown) => unknown)(params)
}
