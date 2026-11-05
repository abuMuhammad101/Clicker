import { CircleHelp, Compass, Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTour } from '@/features/tour/TourProvider'

/** The shortcuts that exist, said once. Every one of them is real: this sheet lists nothing that does not work. */
const SHORTCUTS: { keys: string[]; does: string }[] = [
  { keys: ['/'], does: 'Search the list you are looking at' },
  { keys: ['F2'], does: 'Edit the first editable cell of the highlighted row' },
  { keys: ['↑', '↓'], does: 'Move between rows' },
  { keys: ['Enter'], does: 'Open the highlighted row' },
  { keys: ['Esc'], does: 'Close the open menu, drawer or dialog' },
  { keys: ['?'], does: 'Show this sheet' },
  { keys: ['→', '←'], does: 'Next and back, while a tour is running' },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything here works on the screen you are on.</DialogDescription>
        </DialogHeader>
        <dl className="shortcuts">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.does} className="shortcuts__row">
              <dt className="shortcuts__keys">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className="shortcuts__key">{key}</kbd>
                ))}
              </dt>
              <dd className="shortcuts__does">{shortcut.does}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  )
}

/** Help: the tour (start, or pick up where you stopped) and the shortcut sheet. */
export function HelpMenu() {
  const { tour, canResume, start, resume, running } = useTour()
  const [open, setOpen] = useState(false)
  const [shortcuts, setShortcuts] = useState(false)

  // "?" opens the sheet from anywhere the person is not typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return
      event.preventDefault()
      setShortcuts(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="help-menu__trigger" aria-label="Help">
            <CircleHelp className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="user-menu">
          {tour && (
            <button
              type="button"
              className="user-menu__item"
              disabled={running}
              onClick={() => {
                setOpen(false)
                if (canResume) resume()
                else start()
              }}
            >
              <Compass className="size-4" aria-hidden />
              {canResume ? 'Pick up the tour' : 'Take the tour'}
            </button>
          )}
          {tour && canResume && (
            <button
              type="button"
              className="user-menu__item"
              disabled={running}
              onClick={() => {
                setOpen(false)
                start()
              }}
            >
              <Compass className="size-4" aria-hidden />
              Start the tour again
            </button>
          )}
          <button
            type="button"
            className="user-menu__item"
            onClick={() => {
              setOpen(false)
              setShortcuts(true)
            }}
          >
            <Keyboard className="size-4" aria-hidden />
            Keyboard shortcuts
          </button>
        </PopoverContent>
      </Popover>
    </>
  )
}
