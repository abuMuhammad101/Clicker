import type { ReactNode } from 'react'
import type { FieldSchema, FieldType } from '@/types/schema'
import { BooleanListCell } from './boolean/BooleanListCell'
import { CurrencyListCell } from './currency/CurrencyListCell'
import { DateListCell } from './date/DateListCell'
import { DateTimeListCell } from './datetime/DateTimeListCell'
import { IntegerListCell } from './integer/IntegerListCell'
import { DecimalListCell } from './decimal/DecimalListCell'
import { EmailListCell } from './email/EmailListCell'
import { LongtextListCell } from './longtext/LongtextListCell'
import { ManyToOneListCell } from './many-to-one/ManyToOneListCell'
import { PhoneListCell } from './phone/PhoneListCell'
import { SelectionListCell } from './selection/SelectionListCell'
import { ListCell } from './shared/ListCell'
import { TextListCell } from './text/TextListCell'
import { UrlListCell } from './url/UrlListCell'

/**
 * The list-cell half of the registry: schema type → read-only cell. The
 * list renderer never looks at `schema.type` itself.
 */
export interface ListCellArgs {
  schema: FieldSchema
  value: unknown
  /** Human label for the value, where the value is a reference. */
  label: string | null
  /** The value links to a record this user can't see. */
  restricted?: boolean
}

type Renderer = (args: ListCellArgs) => ReactNode

const asString = (value: unknown) => (value == null ? null : String(value))

const LIST_CELLS: Partial<Record<FieldType, Renderer>> = {
  text: (a) => <TextListCell value={asString(a.value)} />,
  longtext: (a) => <LongtextListCell value={asString(a.value)} />,
  email: (a) => <EmailListCell value={asString(a.value)} />,
  phone: (a) => <PhoneListCell value={asString(a.value)} />,
  url: (a) => <UrlListCell value={asString(a.value)} />,
  boolean: (a) => <BooleanListCell value={a.value === true} />,
  decimal: (a) => (
    <DecimalListCell
      value={a.value == null || a.value === '' ? null : String(a.value)}
      decimalPlaces={a.schema.decimal_places ?? 2}
    />
  ),
  currency: (a) => (
    <CurrencyListCell
      value={a.value == null || a.value === '' ? null : String(a.value)}
      decimalPlaces={a.schema.decimal_places}
    />
  ),
  integer: (a) => <IntegerListCell value={typeof a.value === 'number' ? a.value : a.value == null ? null : Number(a.value)} />,
  date: (a) => <DateListCell value={asString(a.value)} />,
  datetime: (a) => <DateTimeListCell value={asString(a.value)} />,
  selection: (a) => <SelectionListCell value={asString(a.value)} choices={a.schema.choices ?? []} tones={a.schema.tones} />,
  many_to_one: (a) => (
    <ManyToOneListCell
      label={a.label}
      restricted={a.restricted}
      // A person is named, never linked: there is no page for them.
      target={a.schema.person ? undefined : a.schema.target}
      id={typeof a.value === 'number' ? a.value : null}
    />
  ),
}

/** Types whose values are numbers: right-aligned, tabular figures. */
const NUMERIC_TYPES = new Set<FieldType>(['integer', 'decimal', 'currency'])

export function isNumericType(type: FieldType) {
  return NUMERIC_TYPES.has(type)
}

export function renderListCell(args: ListCellArgs): ReactNode {
  const render = LIST_CELLS[args.schema.type]
  if (render) return render(args)
  // Same rule as the form registry: a type with no component is visible,
  // never silently blank — a blank cell would read as "no value".
  return (
    <ListCell title={`No list cell for type “${args.schema.type}” yet`}>
      <span className="list-cell__text" style={{ color: 'var(--danger)' }}>
        {args.schema.type}?
      </span>
    </ListCell>
  )
}
