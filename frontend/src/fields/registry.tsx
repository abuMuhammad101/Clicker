import type { ReactNode } from 'react'
import type { FieldSchema, FieldType } from '@/types/schema'
import { BooleanField } from './boolean/BooleanField'
import { DecimalField } from './decimal/DecimalField'
import { EmailField } from './email/EmailField'
import { LongtextField } from './longtext/LongtextField'
import { ManyToOneField } from './many-to-one/ManyToOneField'
import { PhoneField } from './phone/PhoneField'
import { SelectionField } from './selection/SelectionField'
import { FieldShell } from './shared/FieldShell'
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
  }
}

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
      value={typeof a.value === 'number' ? a.value : null}
      maxDigits={a.schema.max_digits ?? 10}
      decimalPlaces={a.schema.decimal_places ?? 2}
    />
  ),
  selection: (a) => (
    <SelectionField {...common(a)} value={asString(a.value)} choices={a.schema.choices ?? []} />
  ),
  many_to_one: (a) => (
    <ManyToOneField
      {...common(a)}
      value={typeof a.value === 'number' ? a.value : null}
      displayValue={a.displayValue}
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
  return render(args)
}
