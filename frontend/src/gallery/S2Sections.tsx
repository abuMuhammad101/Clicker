import type { ReactNode } from 'react'
import { CurrencyField } from '@/fields/currency/CurrencyField'
import { CurrencyListCell } from '@/fields/currency/CurrencyListCell'
import { DateField } from '@/fields/date/DateField'
import { DateListCell } from '@/fields/date/DateListCell'
import { DateTimeField } from '@/fields/datetime/DateTimeField'
import { DateTimeListCell } from '@/fields/datetime/DateTimeListCell'
import { IntegerField } from '@/fields/integer/IntegerField'
import { IntegerListCell } from '@/fields/integer/IntegerListCell'
import { ManyToOneField } from '@/fields/many-to-one/ManyToOneField'
import { ManyToOneListCell } from '@/fields/many-to-one/ManyToOneListCell'
import { formatMoneyCompact } from '@/lib/money'

/**
 * Gallery sections for S-2's types: every state of date, integer and
 * currency, the read-only datetime, the calculated mark, and a restricted
 * link. Dev-only, like the rest of the gallery.
 */

const noop = () => {}

function TypeSection({ type, source, children }: { type: string; source: string; children: ReactNode }) {
  return (
    <section className="gallery__type">
      <div className="gallery__type-header">
        <span className="gallery__type-name">{type}</span>
        <span className="gallery__type-label">{source}</span>
      </div>
      {children}
    </section>
  )
}

function StateRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="gallery__state">
      <div className="gallery__state-label">{label}</div>
      <div className="gallery__state-content">{children}</div>
    </div>
  )
}

function Cells({ rows }: { rows: { label: string; cell: ReactNode }[] }) {
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">List cell</h3>
      {rows.map(({ label, cell }) => (
        <div key={label} className="gallery__list-row">
          <div className="gallery__list-row-label">{label}</div>
          <div className="gallery__list-cells">
            <div className="gallery__list-cell-slot gallery__list-cell-slot--wide">{cell}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function States({ children }: { children: ReactNode }) {
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">Form states</h3>
      <div className="gallery__states">{children}</div>
    </div>
  )
}

export function S2Sections() {
  return (
    <>
      <TypeSection type="date" source="Contact.customer_since: typed day-first, stored ISO, shown “30 Oct 2026”">
        <States>
          <StateRow label="Default">
            <DateField name="d-default" label="Customer since" value={null} onChange={noop} />
          </StateRow>
          <StateRow label="Focused">
            <DateField name="d-focused" label="Customer since" value={null} onChange={noop} forceFocused />
          </StateRow>
          <StateRow label="Filled">
            <DateField name="d-filled" label="Customer since" value="2026-10-30" onChange={noop} />
          </StateRow>
          <StateRow label="Disabled">
            <DateField name="d-disabled" label="Customer since" value="2026-10-30" onChange={noop} disabled />
          </StateRow>
          <StateRow label="Readonly">
            <DateField name="d-readonly" label="Customer since" value="2026-10-30" onChange={noop} readOnly />
          </StateRow>
          <StateRow label="Error">
            <DateField
              name="d-error"
              label="Customer since"
              value="2026-10-30"
              onChange={noop}
              error="Enter a date no later than today."
            />
          </StateRow>
          <StateRow label="Required + empty">
            <DateField name="d-required" label="Due date" value={null} onChange={noop} required />
          </StateRow>
          <StateRow label="Loading">
            <DateField name="d-loading" label="Customer since" value={null} onChange={noop} loading />
          </StateRow>
          <StateRow label="Picker open (presets)">
            <div style={{ minHeight: 330 }}>
              <DateField name="d-open" label="Customer since" value="2026-10-30" onChange={noop} forceOpen />
            </div>
          </StateRow>
        </States>
        <Cells
          rows={[
            { label: 'Filled / empty', cell: <><DateListCell value="2026-10-30" /> <DateListCell value={null} /></> },
          ]}
        />
      </TypeSection>

      <TypeSection type="integer" source="Contact.payment_terms_days (0 to 365, default 30)">
        <States>
          <StateRow label="Default">
            <IntegerField name="i-default" label="Payment terms (days)" value={null} onChange={noop} maxValue={365} />
          </StateRow>
          <StateRow label="Focused">
            <IntegerField name="i-focused" label="Payment terms (days)" value={null} onChange={noop} forceFocused />
          </StateRow>
          <StateRow label="Filled">
            <IntegerField name="i-filled" label="Payment terms (days)" value={30} onChange={noop} />
          </StateRow>
          <StateRow label="Disabled">
            <IntegerField name="i-disabled" label="Payment terms (days)" value={30} onChange={noop} disabled />
          </StateRow>
          <StateRow label="Readonly">
            <IntegerField name="i-readonly" label="Units in stock" value={1245000} onChange={noop} readOnly />
          </StateRow>
          <StateRow label="Error">
            <IntegerField
              name="i-error"
              label="Payment terms (days)"
              value={400}
              onChange={noop}
              error="Ensure this value is less than or equal to 365."
            />
          </StateRow>
          <StateRow label="Required + empty">
            <IntegerField name="i-required" label="Quantity" value={null} onChange={noop} required />
          </StateRow>
          <StateRow label="Loading">
            <IntegerField name="i-loading" label="Payment terms (days)" value={null} onChange={noop} loading />
          </StateRow>
        </States>
        <Cells
          rows={[
            { label: 'Filled / empty', cell: <><IntegerListCell value={30} /> <IntegerListCell value={null} /></> },
            { label: 'Large / negative', cell: <><IntegerListCell value={1245000} /> <IntegerListCell value={-12} /></> },
          ]}
        />
      </TypeSection>

      <TypeSection type="currency" source="Product.sales_price: PKR, from one setting; strings, never floats">
        <States>
          <StateRow label="Default">
            <CurrencyField name="c-default" label="Sales price" value={null} onChange={noop} maxDigits={10} />
          </StateRow>
          <StateRow label="Focused">
            <CurrencyField name="c-focused" label="Sales price" value={null} onChange={noop} maxDigits={10} forceFocused />
          </StateRow>
          <StateRow label="Filled">
            <CurrencyField name="c-filled" label="Sales price" value="1245000.00" onChange={noop} maxDigits={14} />
          </StateRow>
          <StateRow label="Disabled">
            <CurrencyField name="c-disabled" label="Sales price" value="1245000.00" onChange={noop} maxDigits={14} disabled />
          </StateRow>
          <StateRow label="Readonly">
            <CurrencyField name="c-readonly" label="Credit limit" value="2500000.00" onChange={noop} maxDigits={14} readOnly />
          </StateRow>
          <StateRow label="Error">
            <CurrencyField
              name="c-error"
              label="Credit limit"
              value="-500.00"
              onChange={noop}
              maxDigits={14}
              error="Ensure this value is greater than or equal to 0."
            />
          </StateRow>
          <StateRow label="Required + empty">
            <CurrencyField name="c-required" label="Amount" value={null} onChange={noop} maxDigits={14} required />
          </StateRow>
          <StateRow label="Loading">
            <CurrencyField name="c-loading" label="Sales price" value={null} onChange={noop} maxDigits={14} loading />
          </StateRow>
          <StateRow label="Calculated (computed)">
            <CurrencyField
              name="c-computed"
              label="Margin"
              value="244999.90"
              onChange={noop}
              maxDigits={20}
              computed={{ description: 'Sales price − Cost' }}
            />
          </StateRow>
        </States>
        <Cells
          rows={[
            { label: 'Filled / empty', cell: <><CurrencyListCell value="1245000.00" /> <CurrencyListCell value={null} /></> },
            { label: 'Negative (a minus, never red)', cell: <CurrencyListCell value="-1245.50" /> },
            { label: 'Very large', cell: <CurrencyListCell value="68700000000.00" /> },
            {
              label: 'Compact (summaries)',
              cell: (
                <span className="amount">
                  {formatMoneyCompact('68700000000.00')} · {formatMoneyCompact('1240000.00')} · {formatMoneyCompact('45300.40')}
                </span>
              ),
            },
          ]}
        />
      </TypeSection>

      <TypeSection type="datetime" source="Audit and system times: display only, in the organisation's time zone">
        <States>
          <StateRow label="Readonly (the only state for now)">
            <DateTimeField name="dt" label="Updated" value="2026-10-30T09:05:00Z" />
          </StateRow>
          <StateRow label="Empty">
            <DateTimeField name="dt-empty" label="Posted" value={null} />
          </StateRow>
          <StateRow label="Loading">
            <DateTimeField name="dt-loading" label="Updated" value={null} loading />
          </StateRow>
        </States>
        <Cells rows={[{ label: 'Filled / empty', cell: <><DateTimeListCell value="2026-10-30T09:05:00Z" /> <DateTimeListCell value={null} /></> }]} />
      </TypeSection>

      <TypeSection type="many_to_one · restricted" source="A link whose record this user can't see: the id stays, the name doesn't">
        <States>
          <StateRow label="Readonly, restricted">
            <ManyToOneField
              name="m2o-restricted"
              label="Country"
              value={7}
              displayValue={null}
              restricted
              readOnly
              onChange={noop}
              target={{ app_label: 'core', model: 'country' }}
            />
          </StateRow>
        </States>
        <Cells rows={[{ label: 'Restricted', cell: <ManyToOneListCell label={null} restricted /> }]} />
      </TypeSection>
    </>
  )
}
