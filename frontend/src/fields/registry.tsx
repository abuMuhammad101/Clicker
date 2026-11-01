import type { ReactNode } from 'react'
import type { FieldSchema, FieldType } from '@/types/schema'
import { BooleanField } from './boolean/BooleanField'
import { CurrencyField } from './currency/CurrencyField'
import { DateField } from './date/DateField'
import { DateTimeField } from './datetime/DateTimeField'
import { IntegerField } from './integer/IntegerField'
import { DecimalField } from './decimal/DecimalField'
import { EmailField } from './email/EmailField'
import { LongtextField } from './longtext/LongtextField'
import { ManyToOneField } from './many-to-one/ManyToOneField'
import { PhoneField } from './phone/PhoneField'
import { SelectionField } from './selection/SelectionField'
import { FieldShell } from './shared/FieldShell'
import { WriteOnceNoteContext } from './shared/fieldNotes'
import { TextField } from './text/TextField'
import { UrlField } from './url/UrlField'

/**
 * Everything a form renderer knows about one field at render time. The
 * registry turns this into a concrete component; the renderer never looks
 * at `schema.type` itself.
 */
export interface FormFieldArgs {
  name: string
  schema: FieldSchema
  value: unknown
  /** Human label for the current value, where the value is a reference. */
  displayValue: string | null
  onChange: (value: unknown) => void
  error?: string
  loading?: boolean
  disabled?: boolean
  /** True once this field's value differs from what the form loaded with. */
  dirty?: boolean
  /** Form-level view mode: read-only whatever the field's own schema says. */
  readOnly?: boolean
  /** The value links to a record this user can't see (many_to_one). */
  restricted?: boolean
}

type Renderer = (args: FormFieldArgs) => ReactNode

function common(args: FormFieldArgs) {
  return {
    name: args.name,
    label: args.schema.label,
    required: args.schema.required,
    readOnly: args.schema.read_only || args.readOnly,
    helpText: args.schema.help_text,
    error: args.error,
    loading: args.loading,
    disabled: args.disabled,
    dirty: args.dirty,
    onChange: args.onChange,
    // A computed field carries the "calculated" mark and is never editable.
    computed: args.schema.computed ? { description: args.schema.computed.description } : undefined,
  }
}

const asDecimalString = (value: unknown) => (value == null || value === '' ? null : String(value))
const asNumber = (value: unknown) => (typeof value === 'number' ? value : value == null ? null : Number(value))

const asString = (value: unknown) => (value == null ? null : String(value))

const FORM_COMPONENTS: Partial<Record<FieldType, Renderer>> = {
  text: (a) => <TextField {...common(a)} value={asString(a.value)} />,
  longtext: (a) => <LongtextField {...common(a)} value={asString(a.value)} />,
  email: (a) => <EmailField {...common(a)} value={asString(a.value)} />,
  phone: (a) => <PhoneField {...common(a)} value={asString(a.value)} />,
  url: (a) => <UrlField {...common(a)} value={asString(a.value)} />,
  boolean: (a) => <BooleanField {...common(a)} value={a.value === true} />,
  decimal: (a) => (
    <DecimalField
      {...common(a)}
      value={asDecimalString(a.value)}
      maxDigits={a.schema.max_digits ?? 20}
      decimalPlaces={a.schema.decimal_places ?? 2}
    />
  ),
  currency: (a) => (
    <CurrencyField
      {...common(a)}
      value={asDecimalString(a.value)}
      maxDigits={a.schema.max_digits ?? 20}
      decimalPlaces={a.schema.decimal_places}
    />
  ),
  integer: (a) => (
    <IntegerField
      {...common(a)}
      value={asNumber(a.value)}
      maxValue={typeof a.schema.max_value === 'number' ? a.schema.max_value : undefined}
    />
  ),
  date: (a) => (
    <DateField
      {...common(a)}
      value={asString(a.value)}
      min={typeof a.schema.min_value === 'string' ? a.schema.min_value : undefined}
      max={typeof a.schema.max_value === 'string' ? a.schema.max_value : undefined}
    />
  ),
  datetime: (a) => <DateTimeField {...common(a)} value={asString(a.value)} />,
  selection: (a) => (
    <SelectionField {...common(a)} value={asString(a.value)} choices={a.schema.choices ?? []} />
  ),
  many_to_one: (a) => (
    <ManyToOneField
      {...common(a)}
      value={typeof a.value === 'number' ? a.value : null}
      displayValue={a.displayValue}
      restricted={a.restricted}
      target={a.schema.target!}
      domain={
        a.schema.domain
          ? Object.fromEntries(Object.entries(a.schema.domain).map(([k, v]) => [k, String(v)]))
          : undefined
      }
    />
  ),
}

/**
 * A registry type with no form component yet renders as a visible notice,
 * never as nothing: a field silently missing from a form is the worst
 * failure mode a generated UI has. Same principle as the schema engine's
 * "Ungrouped" group.
 */
function Unsupported({ name, schema }: FormFieldArgs) {
  return (
    <FieldShell label={schema.label} htmlFor={name}>
      <div className="flex h-[var(--control-height)] items-center text-[length:var(--text-sm)] text-[color:var(--danger)]">
        No form component for type “{schema.type}” yet.
      </div>
    </FieldShell>
  )
}

export function renderFormField(args: FormFieldArgs): ReactNode {
  const render = FORM_COMPONENTS[args.schema.type] ?? Unsupported
  const note = args.schema.write_once?.note
  if (!note) return render(args)
  return <WriteOnceNoteContext.Provider value={note}>{render(args)}</WriteOnceNoteContext.Provider>
}
