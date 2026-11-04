import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusChip } from '@/components/StatusChip'
import { cn } from '@/lib/utils'
import type { Tone } from '@/types/schema'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps, emptyPrompt } from '../shared/types'

export interface Choice {
  value: string
  label: string
}

interface SelectionFieldProps extends FieldProps<string> {
  choices: Choice[]
  /** A calculated status reads as a chip, in the tone the schema gives each value. */
  tones?: Record<string, Tone>
}

export function SelectionField({
  name,
  label,
  value,
  onChange,
  choices,
  tones,
  required,
  disabled,
  readOnly,
  loading,
  error,
  helpText,
  placeholder,
  dirty,
  forceFocused,
}: SelectionFieldProps) {
  if (loading) {
    return (
      <FieldShell label={label} required={required}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }

  const selected = choices.find((choice) => choice.value === value)

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      required={required}
      error={error}
      helpText={helpText}
      readOnly={readOnly}
      dirty={dirty}
      readOnlyValue={
        selected && tones ? <StatusChip label={selected.label} tone={tones[selected.value] ?? 'neutral'} /> : selected?.label
      }
    >
      <Select value={value ?? undefined} onValueChange={(next) => onChange?.(next)} disabled={disabled}>
        <SelectTrigger
          id={name}
          className={cn('w-full', forceFocused && FORCE_FOCUS_CLASSES)}
          aria-invalid={!!error}
        >
          <SelectValue placeholder={placeholder ?? emptyPrompt(label)} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}
