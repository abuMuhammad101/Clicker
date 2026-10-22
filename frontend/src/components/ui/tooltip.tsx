import type { ReactElement, ReactNode } from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

/**
 * A short label for something that has no room for one (the icon rail).
 * Instant where the native `title` takes a second, and styled like the toast:
 * inverted, so it reads as the system speaking. Never the only home of
 * information; the trigger keeps its own accessible name.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  label,
  side = 'right',
  children,
}: {
  label: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} className="tooltip">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
