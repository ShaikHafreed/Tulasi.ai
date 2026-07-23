import { useEffect, useState } from 'react'
import { Camera, CircleCheck, Download, Hand, LayoutDashboard, Library, Maximize2, MessageCircle, Settings } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { executeCommand, isCommandAvailable } from '@/lib/tulasiCommands'
import type { DashboardView } from './Sidebar'

// Global ⌘K / Ctrl+K palette. Purely an alternate entry point — navigation
// goes through HomePage's setView, gesture through the same setter Settings
// uses, and model actions (export / presentation) through the existing
// tulasiCommands whitelist. No logic is duplicated here.
export default function CommandPalette({
  onNavigate,
  onToggleGesture,
  gestureEnabled,
}: {
  onNavigate: (view: DashboardView) => void
  onToggleGesture: () => void
  gestureEnabled: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function run(action: () => void) {
    setOpen(false)
    action()
  }

  // Evaluated on each open (open toggling re-renders) — model actions only
  // appear when a scan's viewer is actually mounted and has registered them.
  const canExport = isCommandAvailable('exportModel')
  const canPresent = isCommandAvailable('togglePresentation')

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => onNavigate('scan'))}>
            <Camera /> New scan
          </CommandItem>
          <CommandItem onSelect={() => run(() => onNavigate('library'))}>
            <Library /> Go to Library
          </CommandItem>
          <CommandItem onSelect={() => run(() => onNavigate('dashboard'))}>
            <LayoutDashboard /> Go to Dashboard
          </CommandItem>
          <CommandItem onSelect={() => run(() => onNavigate('assistant'))}>
            <MessageCircle /> Go to Assistant
          </CommandItem>
          <CommandItem onSelect={() => run(() => onNavigate('print'))}>
            <CircleCheck /> Go to Print check
          </CommandItem>
          <CommandItem onSelect={() => run(() => onNavigate('settings'))}>
            <Settings /> Open settings
          </CommandItem>
        </CommandGroup>

        {(canExport || canPresent) && (
          <CommandGroup heading="Model">
            {canExport && (
              <CommandItem onSelect={() => run(() => executeCommand('exportModel', {}))}>
                <Download /> Export model (STL)
              </CommandItem>
            )}
            {canPresent && (
              <CommandItem onSelect={() => run(() => executeCommand('togglePresentation', {}))}>
                <Maximize2 /> Toggle presentation mode
              </CommandItem>
            )}
          </CommandGroup>
        )}

        <CommandGroup heading="Preferences">
          <CommandItem onSelect={() => run(onToggleGesture)}>
            <Hand /> Toggle gesture control
            <CommandShortcut>{gestureEnabled ? 'ON' : 'OFF'}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
