import { cn } from '@/lib/utils'
import type { Tone } from '@/types/schema'
import './StatusChip.css'

/**
 * A record's state as a small chip. The tone comes from the schema
 * (Schema.workflow.tones), never from the label: green, amber and red carry
 * meaning here, which is why the accent is violet and never used for a state.
 */
export function StatusChip({ label, tone = 'neutral', className }: { label: string; tone?: Tone; className?: string }) {
  return (
    <span className={cn('status-chip', `status-chip--${tone}`, className)} title={label}>
      <span className="status-chip__dot" aria-hidden />
      {label}
    </span>
  )
}
