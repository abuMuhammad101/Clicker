import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Check, ListFilter, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useManyToOneSearch } from '@/fields/many-to-one/useManyToOneSearch'
import { apiGet } from '@/lib/api'
import { typeIcon } from '@/fields/typeIcons'
import { formatDate, parseDateText } from '@/lib/dates'
import {
  DATE_PRESETS,
  describeFilter,
  filterProblem,
  formatFilter,
  isFilterable,
  operatorsFor,
  parseFilter,
  type FilterItem,
  type FilterLabels,
  type Operator,
} from '@/lib/listQuery'
import { parseDecimalText } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { FieldSchema, ModelSchema } from '@/types/schema'
import './FilterBar.css'

/**
 * The list's filters as chips that read as sentences ("Amount at least Rs 1
 * lakh"), an "Add filter" button, and Clear all. Every chip opens the same
 * editor it was made with. Operators come from the field's type, never from
 * the model: the editor for a currency field is the editor for every
 * currency field.
 *
 * A filter this user can't apply (a field they can't read, from a shared
 * link) is shown, struck through and marked, but never sent; removing it is
 * one click.
 */
export function FilterBar({
  schema,
  filters,
  labels,
  onLabels,
  onChange,
  forceEditing,
}: {
  schema: ModelSchema
  filters: string[]
  labels: FilterLabels
  onLabels: (field: string, labels: Record<string, string>) => void
  onChange: (filters: string[]) => void
  /** Gallery only: open this chip's editor. */
  forceEditing?: number
}) {
  const [adding, setAdding] = useState(false)
  const replace = (index: number, item: FilterItem | null) => {
    const next = filters.slice()
    if (item) next[index] = formatFilter(item)
    else next.splice(index, 1)
    onChange(next)
  }

  return (
    <div className="filter-bar" role="group" aria-label="Filters">
      {filters.map((raw, index) => (
        <FilterChip
          key={`${raw}-${index}`}
          schema={schema}
          raw={raw}
          labels={labels}
          onLabels={onLabels}
          onApply={(item) => replace(index, item)}
          onRemove={() => replace(index, null)}
          forceOpen={forceEditing === index}
        />
      ))}
      <Popover open={adding} onOpenChange={setAdding}>
        <PopoverTrigger asChild>
          <button type="button" className="filter-bar__add">
            {filters.length ? <Plus aria-hidden /> : <ListFilter aria-hidden />}
            {filters.length ? 'Filter' : 'Add filter'}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="filter-popover">
          <NewFilter
            schema={schema}
            labels={labels}
            onLabels={onLabels}
            onApply={(item) => {
              onChange([...filters, formatFilter(item)])
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </PopoverContent>
      </Popover>
      {filters.length > 0 && (
        <button type="button" className="filter-bar__clear" onClick={() => onChange([])}>
          Clear all
        </button>
      )}
    </div>
  )
}

function FilterChip({
  schema,
  raw,
  labels,
  onLabels,
  onApply,
  onRemove,
  forceOpen,
}: {
  schema: ModelSchema
  raw: string
  labels: FilterLabels
  onLabels: (field: string, labels: Record<string, string>) => void
  onApply: (item: FilterItem) => void
  onRemove: () => void
  forceOpen?: boolean
}) {
  const [openState, setOpen] = useState(false)
  const open = forceOpen || openState
  const item = parseFilter(raw)
  const problem = filterProblem(item, schema)
  const field = item ? schema.fields[item.field] : undefined
  const text = item ? describeFilter(item, field, labels) : { subject: raw, predicate: '' }
  useLinkLabels(item, field, labels, onLabels)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className={cn('filter-chip', problem && 'filter-chip--invalid', open && 'filter-chip--editing')}>
        <PopoverAnchor asChild>
          <PopoverTrigger asChild disabled={!field}>
            <button type="button" className="filter-chip__body" title={problem ?? undefined}>
              {problem && <AlertCircle className="filter-chip__alert" aria-hidden />}
              <span className="filter-chip__subject">{text.subject}</span>
              <span className="filter-chip__predicate">{text.predicate}</span>
            </button>
          </PopoverTrigger>
        </PopoverAnchor>
        <button type="button" className="filter-chip__remove" onClick={onRemove} aria-label={`Remove filter: ${text.subject} ${text.predicate}`}>
          <X aria-hidden />
        </button>
      </span>
      {field && item && (
        <PopoverContent align="start" className="filter-popover">
          <FilterEditor
            name={item.field}
            field={field}
            initial={item}
            labels={labels[item.field] ?? {}}
            onLabels={(more) => onLabels(item.field, more)}
            onApply={(next) => {
              onApply(next)
              setOpen(false)
            }}
            onCancel={() => setOpen(false)}
          />
        </PopoverContent>
      )}
    </Popover>
  )
}

/** A chip naming linked records needs their names: ask the target's own search, one id at a time. */
function useLinkLabels(
  item: FilterItem | null,
  field: FieldSchema | undefined,
  labels: FilterLabels,
  onLabels: (field: string, labels: Record<string, string>) => void,
) {
  const missing = item && field?.type === 'many_to_one' && field.target
    ? item.values.filter((id) => !(labels[item.field] ?? {})[id])
    : []
  const key = missing.join(',')
  useEffect(() => {
    if (!item || !field?.target || !key) return
    let cancelled = false
    void Promise.all(
      key.split(',').map((id) =>
        apiGet<{ value: number; label: string }[]>(`/data/${field.target!.app_label}/${field.target!.model}/search/?id=${id}`)
          .then((options) => [id, options[0]?.label ?? 'Restricted'] as const)
          .catch(() => [id, 'Restricted'] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) onLabels(item.field, Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
    // Only when the set of unnamed ids changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

function NewFilter({
  schema,
  labels,
  onLabels,
  onApply,
  onCancel,
}: {
  schema: ModelSchema
  labels: FilterLabels
  onLabels: (field: string, labels: Record<string, string>) => void
  onApply: (item: FilterItem) => void
  onCancel: () => void
}) {
  const [name, setName] = useState<string | null>(null)
  const candidates = useMemo(
    () =>
      Object.entries(schema.fields).filter(([key, field]) => key !== 'id' && isFilterable(field)),
    [schema.fields],
  )
  if (name) {
    const field = schema.fields[name]
    return (
      <FilterEditor
        name={name}
        field={field}
        labels={labels[name] ?? {}}
        onLabels={(more) => onLabels(name, more)}
        onApply={onApply}
        onCancel={() => setName(null)}
      />
    )
  }
  return (
    <Command className="filter-fields">
      <CommandInput placeholder="Filter by…" autoFocus />
      <CommandList>
        <CommandEmpty>No field matches.</CommandEmpty>
        <CommandGroup>
          {candidates.map(([key, field]) => {
            const Icon = typeIcon(field.type)
            return (
              <CommandItem key={key} value={`${field.label} ${key}`} onSelect={() => setName(key)}>
                <Icon className="filter-fields__icon" aria-hidden />
                {field.label}
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
      <div className="filter-editor__footer">
        <Button type="button" variant="ghost" className="filter-editor__button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Command>
  )
}

const OPERATOR_LABEL: Record<Operator, string> = {
  contains: 'contains',
  is: 'is',
  empty: 'is empty',
  in: 'is any of',
  on: 'on',
  before: 'before',
  after: 'after',
  between: 'between',
  older_than: 'more than … days ago',
  preset: 'in a period',
  eq: '=',
  gte: '≥',
  lte: '≤',
}

/**
 * One filter's editor: an operator (by the field's type) and its value.
 * Enter applies; Escape (the popover's own) cancels. A value that isn't one
 * keeps Apply disabled and says why, in words.
 */
export function FilterEditor({
  name,
  field,
  initial,
  labels,
  onLabels,
  onApply,
  onCancel,
}: {
  name: string
  field: FieldSchema
  initial?: FilterItem
  labels: Record<string, string>
  onLabels: (labels: Record<string, string>) => void
  onApply: (item: FilterItem) => void
  onCancel: () => void
}) {
  const operators = operatorsFor(field.type)
  const [op, setOp] = useState<Operator>(initial?.op ?? defaultOperator(field))
  const [values, setValues] = useState<string[]>(initial?.values ?? [])
  const [texts, setTexts] = useState<string[]>(() => (initial?.values ?? []).map((v) => shownValue(field, v)))
  const [error, setError] = useState<string | null>(null)

  const choose = (next: Operator) => {
    setOp(next)
    setError(null)
    if (next === 'empty') {
      setValues([])
      setTexts([])
    }
  }

  const apply = (item?: FilterItem) => {
    const candidate = item ?? { field: name, op, values }
    if (candidate.op !== 'empty' && candidate.values.length === 0) {
      setError(`Choose a value for ${field.label.toLowerCase()}.`)
      return
    }
    onApply(candidate)
  }

  // Free text and numbers are typed; their value is read when Apply is pressed.
  const readTyped = (index: number, text: string) => {
    const nextTexts = texts.slice()
    nextTexts[index] = text
    setTexts(nextTexts)
    const parsed = parseTyped(field, op, text)
    const next = values.slice()
    if (parsed === null) {
      next[index] = ''
      setError(text.trim() ? invalidMessage(field) : null)
    } else {
      next[index] = parsed
      setError(null)
    }
    setValues(op === 'between' ? next : next.slice(0, 1))
  }

  const typedCount = op === 'between' ? 2 : 1
  const typed = op !== 'empty' && op !== 'in' && op !== 'preset' && !(op === 'is' && field.type === 'boolean')

  return (
    <form
      className="filter-editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (typed && (values.filter(Boolean).length !== typedCount)) {
          setError(error ?? `Enter ${typedCount === 2 ? 'both values' : 'a value'}.`)
          return
        }
        apply()
      }}
    >
      <p className="filter-editor__title">{field.label}</p>
      {operators.length > 1 && (
        <div className="filter-editor__ops" role="radiogroup" aria-label="Condition">
          {operators.map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={op === candidate}
              className={cn('filter-editor__op', op === candidate && 'filter-editor__op--on')}
              onClick={() => choose(candidate)}
            >
              {OPERATOR_LABEL[candidate]}
            </button>
          ))}
        </div>
      )}

      {field.type === 'boolean' && (
        <div className="filter-editor__ops" role="radiogroup" aria-label={field.label}>
          {['true', 'false'].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={values[0] === value}
              className={cn('filter-editor__op', values[0] === value && 'filter-editor__op--on')}
              onClick={() => apply({ field: name, op: 'is', values: [value] })}
            >
              {value === 'true' ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )}

      {field.type === 'selection' && (
        <ul className="filter-editor__choices">
          {(field.choices ?? []).map((choice) => {
            const value = String(choice.value)
            const checked = values.includes(value)
            return (
              <li key={value}>
                <label className="filter-editor__choice">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => setValues(checked ? values.filter((v) => v !== value) : [...values, value])}
                  />
                  {choice.label}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {field.type === 'many_to_one' && op === 'in' && field.target && (
        <LinkPicker
          target={field.target}
          selected={values}
          labels={labels}
          onChange={(ids, more) => {
            setValues(ids)
            onLabels(more)
          }}
        />
      )}

      {field.type === 'date' && op === 'preset' && (
        <div className="filter-editor__presets">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={cn('filter-editor__op', values[0] === preset.value && 'filter-editor__op--on')}
              onClick={() => apply({ field: name, op: 'preset', values: [preset.value] })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {typed && (
        <div className="filter-editor__inputs">
          {Array.from({ length: typedCount }, (_, index) => (
            <TypedInput
              key={`${op}-${index}`}
              field={field}
              op={op}
              value={texts[index] ?? ''}
              autoFocus={index === 0}
              placeholder={placeholderFor(field, op, index)}
              onChange={(text) => readTyped(index, text)}
              hint={field.type === 'date' && values[index] ? formatDate(values[index]) : undefined}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="filter-editor__error" role="alert">
          {error}
        </p>
      )}

      <div className="filter-editor__footer">
        <Button type="button" variant="ghost" className="filter-editor__button" onClick={onCancel}>
          {initial ? 'Cancel' : 'Back'}
        </Button>
        {field.type !== 'boolean' && op !== 'preset' && (
          <Button type="submit" className="filter-editor__button">
            <Check className="size-3.5" aria-hidden />
            Apply
          </Button>
        )}
      </div>
    </form>
  )
}

function TypedInput({
  field,
  op,
  value,
  onChange,
  placeholder,
  autoFocus,
  hint,
}: {
  field: FieldSchema
  op: Operator
  value: string
  onChange: (text: string) => void
  placeholder: string
  autoFocus?: boolean
  hint?: ReactNode
}) {
  const numeric = field.type === 'integer' || field.type === 'decimal' || field.type === 'currency' || op === 'older_than'
  return (
    <label className="filter-editor__field">
      {field.type === 'currency' && op !== 'older_than' && <span className="filter-editor__affix">Rs</span>}
      <input
        className={cn('filter-editor__input', numeric && 'filter-editor__input--numeric')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        autoFocus={autoFocus}
        aria-label={placeholder}
      />
      {hint && <span className="filter-editor__hint">{hint}</span>}
    </label>
  )
}

function LinkPicker({
  target,
  selected,
  labels,
  onChange,
}: {
  target: { app_label: string; model: string }
  selected: string[]
  labels: Record<string, string>
  onChange: (ids: string[], labels: Record<string, string>) => void
}) {
  const [query, setQuery] = useState('')
  const { options, loading } = useManyToOneSearch(target, undefined, query, true)
  return (
    <Command shouldFilter={false} className="filter-link">
      <CommandInput placeholder="Search…" value={query} onValueChange={setQuery} autoFocus />
      <CommandList>
        {loading ? (
          <div className="picker-skeleton" aria-busy="true" aria-label="Searching">
            {[68, 52, 60].map((width) => (
              <Skeleton key={width} className="h-3" style={{ width: `${width}%` }} />
            ))}
          </div>
        ) : (
          <>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const id = String(option.value)
                const checked = selected.includes(id)
                return (
                  <CommandItem
                    key={id}
                    value={id}
                    onSelect={() =>
                      onChange(checked ? selected.filter((v) => v !== id) : [...selected, id], { [id]: option.label })
                    }
                  >
                    <Check className={cn('size-3.5', !checked && 'invisible')} aria-hidden />
                    {option.label}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
      {selected.length > 0 && (
        <p className="filter-link__selected">
          {selected.length === 1 ? (labels[selected[0]] ?? '1 selected') : `${selected.length} selected`}
        </p>
      )}
    </Command>
  )
}

function defaultOperator(field: FieldSchema): Operator {
  switch (field.type) {
    case 'integer':
    case 'decimal':
    case 'currency':
      return 'gte'
    case 'date':
      return 'preset'
    case 'selection':
    case 'many_to_one':
      return 'in'
    case 'boolean':
      return 'is'
    default:
      return 'contains'
  }
}

function placeholderFor(field: FieldSchema, op: Operator, index: number) {
  if (op === 'older_than') return 'Days'
  if (field.type === 'date') return index === 0 ? (op === 'between' ? 'From, e.g. 1/10/2026' : 'e.g. 1/10/2026') : 'To'
  if (field.type === 'integer' || field.type === 'decimal' || field.type === 'currency') {
    return op === 'between' ? (index === 0 ? 'From' : 'To') : 'Amount'
  }
  return 'Text'
}

function parseTyped(field: FieldSchema, op: Operator, text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (op === 'older_than') return /^\d+$/.test(trimmed) ? trimmed : null
  if (field.type === 'date') return parseDateText(trimmed)
  if (field.type === 'integer') {
    const parsed = parseDecimalText(trimmed)
    return parsed !== null && !parsed.includes('.') ? parsed : null
  }
  if (field.type === 'decimal' || field.type === 'currency') return parseDecimalText(trimmed)
  return text
}

function shownValue(field: FieldSchema, value: string) {
  if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
  return value
}

function invalidMessage(field: FieldSchema) {
  if (field.type === 'date') return 'Type a date, day first: 30/10/2026, or “today”.'
  if (field.type === 'integer') return 'Type a whole number.'
  return 'Type a number.'
}
