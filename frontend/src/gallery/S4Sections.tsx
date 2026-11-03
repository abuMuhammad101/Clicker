import { useState, type ReactNode } from 'react'
import { FilterBar } from '@/features/list-renderer/FilterBar'
import { GroupRow } from '@/features/list-renderer/ListRenderer'
import { SummaryStrip } from '@/features/list-renderer/SummaryStrip'
import { ViewMenu } from '@/features/list-renderer/ViewMenu'
import type { FilterLabels, GroupHeader, SavedView, Summary } from '@/lib/listQuery'
import type { ModelSchema } from '@/types/schema'

/**
 * Gallery sections for S-4's list tools: filter chips, the views menu, group
 * headers and the summary strip, each in every state, with made-up data
 * shaped like the lab bill's. Dev-only, like the rest of the gallery.
 */

const noop = () => {}
const later = () => Promise.resolve()

const BILL_SCHEMA = {
  model: 'labbill',
  app_label: 'workflowlab',
  verbose_name: 'lab bill',
  verbose_name_plural: 'lab bills',
  display_field: 'customer',
  groups: [],
  list: { columns: [], sort: [], default_filters: {}, search_fields: [] },
  actions: { view: true, create: true, update: true, archive: false, delete: false },
  fields: {
    customer: { type: 'text', label: 'Customer', required: true, read_only: false, visible_when: null },
    amount: { type: 'currency', label: 'Amount', required: true, read_only: false, visible_when: null, decimal_places: 2 },
    due_date: { type: 'date', label: 'Due date', required: false, read_only: false, visible_when: null },
    state: {
      type: 'selection',
      label: 'State',
      required: true,
      read_only: true,
      visible_when: null,
      choices: [
        { value: 'draft', label: 'Draft' },
        { value: 'posted', label: 'Posted' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
    },
    is_customer: { type: 'boolean', label: 'Customer', required: false, read_only: false, visible_when: null },
    country: {
      type: 'many_to_one',
      label: 'Customer',
      required: false,
      read_only: false,
      visible_when: null,
      target: { app_label: 'core', model: 'contact' },
    },
  },
} as unknown as ModelSchema

const LABELS: FilterLabels = { country: { 1: 'Acme Corporation', 4: 'Globex Industries', 9: 'Northwind Traders' } }

function Section({ name, label, id, children }: { name: string; label: string; id?: string; children: ReactNode }) {
  return (
    <section className="gallery__type" id={id}>
      <div className="gallery__type-header">
        <span className="gallery__type-name">{name}</span>
        <span className="gallery__type-label">{label}</span>
      </div>
      {children}
    </section>
  )
}

function Example({ caption, children, minHeight }: { caption: string; children: ReactNode; minHeight?: number }) {
  return (
    <figure className="gallery__record">
      <figcaption className="gallery__record-caption">{caption}</figcaption>
      <div className="gallery__s4-stage" style={minHeight ? { minHeight } : undefined}>
        {children}
      </div>
    </figure>
  )
}

function Filters() {
  const [filters, setFilters] = useState(['state:in:posted', 'amount:gte:100000'])
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">Filter chips: sentences, one per filter</h3>
      <div className="gallery__records">
        <Example caption="Empty: one way in">
          <FilterBar schema={BILL_SCHEMA} filters={[]} labels={LABELS} onLabels={noop} onChange={noop} />
        </Example>
        <Example caption="Default (hover a chip to see its border firm up; try it, these are live)">
          <FilterBar schema={BILL_SCHEMA} filters={filters} labels={LABELS} onLabels={noop} onChange={setFilters} />
        </Example>
        <Example caption="Every type, as its sentence">
          <FilterBar
            schema={BILL_SCHEMA}
            filters={[
              'state:in:posted',
              'state:in:draft,cancelled',
              'due_date:before:2026-10-01',
              'due_date:preset:this_month',
              'due_date:older_than:90',
              'amount:gte:100000',
              'amount:between:50000,2500000',
              'customer:contains:indus',
              'is_customer:is:true',
              'country:in:1,4,9',
              'due_date:empty',
            ]}
            labels={LABELS}
            onLabels={noop}
            onChange={noop}
          />
        </Example>
        <Example caption="Editing (its editor open, by the field's type)" minHeight={190}>
          <FilterBar
            schema={BILL_SCHEMA}
            filters={['state:in:posted', 'amount:gte:100000']}
            labels={LABELS}
            onLabels={noop}
            onChange={noop}
            forceEditing={1}
          />
        </Example>
        <Example caption="Invalid: a field this user can't read, from a shared link. Shown, struck through, never sent">
          <FilterBar
            schema={BILL_SCHEMA}
            filters={['state:in:posted', 'credit_limit:gte:100000']}
            labels={LABELS}
            onLabels={noop}
            onChange={noop}
          />
          <p className="list-filterline__note">1 filter isn’t available to you</p>
        </Example>
      </div>
    </div>
  )
}

const MODULE_VIEWS: SavedView[] = [
  { id: 'module:aging', label: 'Aging', kind: 'module', owner: null, shared: true, editable: false, dropped: 0, state: { filters: ['state:in:posted'], ordering: '', group_by: 'days_overdue', collapsed: [], columns: null, density: null } },
  { id: 'module:overdue_90', label: 'Overdue over 90 days', kind: 'module', owner: null, shared: true, editable: false, dropped: 0, state: { filters: [], ordering: '', group_by: null, collapsed: [], columns: null, density: null } },
]
const OWN_VIEWS: SavedView[] = [
  { id: '1', label: 'Collections: 90+ days open', kind: 'personal', owner: null, shared: true, editable: true, dropped: 0, state: { filters: [], ordering: '', group_by: null, collapsed: [], columns: null, density: null } },
  { id: '2', label: 'Karachi, over 1 lakh', kind: 'shared', owner: 'Ayesha Khan', shared: true, editable: false, dropped: 1, state: { filters: [], ordering: '', group_by: null, collapsed: [], columns: null, density: null } },
]

function Views() {
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">Views menu: the list's title is the view it shows</h3>
      <div className="gallery__records gallery__records--grid">
        <Example caption="No view of your own yet (module views only)" minHeight={300}>
          <ViewMenu plural="lab bills" views={MODULE_VIEWS} activeId={null} changed={false} onApply={noop} onSave={later} onUpdate={later} onDelete={later} forceOpen />
        </Example>
        <Example caption="Your own and shared views; the active one changed: Update appears" minHeight={360}>
          <ViewMenu plural="lab bills" views={[...MODULE_VIEWS, ...OWN_VIEWS]} activeId="1" changed onApply={noop} onSave={later} onUpdate={later} onDelete={later} forceOpen />
        </Example>
        <Example caption="Loading">
          <ViewMenu plural="lab bills" views={null} activeId={null} changed={false} onApply={noop} onSave={later} onUpdate={later} onDelete={later} />
        </Example>
        <Example caption="Closed, a module view active and edited">
          <ViewMenu plural="lab bills" views={MODULE_VIEWS} activeId="module:aging" changed onApply={noop} onSave={later} onUpdate={later} onDelete={later} />
        </Example>
      </div>
    </div>
  )
}

const COLUMNS = [
  { name: 'number', width: 170, type: 'text' },
  { name: 'customer', width: 220, type: 'text' },
  { name: 'due_date', width: 130, type: 'date' },
  { name: 'amount', width: 190, type: 'currency' },
  { name: 'state', width: 120, type: 'selection' },
]
const header = (overrides: Partial<GroupHeader>): GroupHeader => ({
  key: '4',
  label: '90+ days',
  count: 5427,
  sums: { amount: '1008150500.00' },
  filter: 'days_overdue:gte:91',
  ...overrides,
})

function GroupLine({ caption, group, collapsed = false, loading }: { caption: string; group: GroupHeader; collapsed?: boolean; loading?: boolean }) {
  return (
    <Example caption={caption}>
      <div className="gallery__s4-group">
        <GroupRow group={group} index={0} start={0} collapsed={collapsed} onToggle={noop} columns={COLUMNS} loading={loading} />
      </div>
    </Example>
  )
}

function Groups() {
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">Group header: label, count, and the sum under every money column</h3>
      <div className="gallery__records">
        <GroupLine caption="Expanded" group={header({})} />
        <GroupLine caption="Collapsed" group={header({ key: '1', label: '0–30 days', count: 591, sums: { amount: '110748500.00' } })} collapsed />
        <GroupLine caption="Loading (count and sums on their way)" group={header({})} loading />
        <GroupLine caption="Empty value" group={header({ key: '', label: 'No customer', count: 12, sums: { amount: '0.00' }, filter: 'customer:empty', empty: true })} />
        <GroupLine caption="A linked record this user can't see" group={header({ key: '7', label: null, restricted: true, count: 3, sums: { amount: '45300.00' } })} />
        <GroupLine caption="Outside every bucket: can't be opened as one group" group={header({ key: '', label: 'Other', count: 1, sums: { amount: '60000.00' }, filter: null })} />
      </div>
    </div>
  )
}

const SUMMARIES: Summary[] = [
  { key: '0', label: 'Outstanding', aggregate: 'sum', type: 'currency', value: '1470562300.00', filter: ['state:in:posted'] },
  { key: '1', label: 'Overdue', aggregate: 'sum', type: 'currency', value: '1343850400.00', filter: ['state:in:posted', 'days_overdue:gte:1'] },
  { key: '2', label: 'Posted this month', aggregate: 'sum', type: 'currency', value: '11030900.00', filter: ['state:in:posted', 'issued_on:preset:this_month'] },
  { key: '3', label: 'Bills', aggregate: 'count', type: 'integer', value: '10005', filter: [] },
]

function Summaries() {
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">Summary strip: lakh and crore, the exact figure on hover, click to narrow</h3>
      <div className="gallery__records">
        <Example caption="Default">
          <SummaryStrip summaries={SUMMARIES} loading={false} slots={4} onApply={noop} />
        </Example>
        <Example caption="Loading (first answer)">
          <SummaryStrip summaries={null} loading slots={4} />
        </Example>
        <Example caption="Updating (filters changed; the old figures stay, quieter)">
          <SummaryStrip summaries={SUMMARIES} loading slots={4} onApply={noop} />
        </Example>
        <Example caption="Zero is an answer">
          <SummaryStrip
            summaries={SUMMARIES.map((s) => ({ ...s, value: s.type === 'currency' ? '0.00' : '0' }))}
            loading={false}
            slots={4}
            onApply={noop}
          />
        </Example>
        <Example caption="Restricted: a summary over a field this user can't read isn't sent, so it isn't drawn">
          <SummaryStrip summaries={SUMMARIES.filter((s) => s.key !== '1')} loading={false} slots={3} onApply={noop} />
        </Example>
      </div>
    </div>
  )
}

export function S4Sections() {
  return (
    <>
      <Section name="filters" label="?filter=field:op:value, one grammar for every model" id="filters">
        <Filters />
      </Section>
      <Section name="views" label="Schema.views and saved views" id="views">
        <Views />
      </Section>
      <Section name="groups" label="?group_by=: one aggregate query for every header" id="groups">
        <Groups />
      </Section>
      <Section name="summaries" label="Schema.summaries: at most four, over the filtered rows" id="summaries">
        <Summaries />
      </Section>
    </>
  )
}
