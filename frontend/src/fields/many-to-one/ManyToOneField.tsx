import { useState } from 'react'
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'
import { useManyToOneSearch } from './useManyToOneSearch'

interface ManyToOneFieldProps extends FieldProps<number> {
  target: { app_label: string; model: string }
  domain?: Record<string, string>
  /** The current value's label. The field only ever holds an id — the
      label comes from wherever that id was resolved (the record's own
      data, or the last search result the user picked). */
  displayValue?: string | null
  /** Gallery-only: keeps the popover open so a state can be screenshotted. */
  forceOpen?: boolean
}

export function ManyToOneField({
  name,
  label,
  value,
  displayValue,
  onChange,
  target,
  domain,
  required,
  disabled,
  readOnly,
  loading,
  error,
  helpText,
  placeholder,
  forceFocused,
  forceOpen,
}: ManyToOneFieldProps) {
  const [openState, setOpenState] = useState(false)
  const open = forceOpen ?? openState
  const [query, setQuery] = useState('')
  const { options, loading: searching } = useManyToOneSearch(target, domain, query, open)

  if (loading) {
    return (
      <FieldShell label={label} required={required}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      required={required}
      error={error}
      helpText={helpText}
      readOnly={readOnly}
      readOnlyValue={displayValue || undefined}
    >
      <Popover open={open} onOpenChange={setOpenState}>
        <PopoverTrigger asChild>
          <Button
            id={name}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={!!error}
            disabled={disabled}
            className={cn(
              'h-[var(--control-height)] w-full justify-between font-normal text-[length:var(--text-base)]',
              !displayValue && 'text-muted-foreground',
              forceFocused && FORCE_FOCUS_CLASSES,
            )}
          >
            <span className="truncate">{displayValue || placeholder || 'Search…'}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} />
            <CommandList>
              {searching ? (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Searching…
                </div>
              ) : (
                <>
                  <CommandEmpty>No results.</CommandEmpty>
                  <CommandGroup>
                    {options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={String(option.value)}
                        onSelect={() => {
                          onChange?.(option.value)
                          setOpenState(false)
                        }}
                      >
                        <Check
                          className={cn('size-4', value === option.value ? 'opacity-100' : 'opacity-0')}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  )
}
