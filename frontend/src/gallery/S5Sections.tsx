import type { ReactNode } from 'react'
import { ActivityList, type ActivityEntry } from '@/features/form-renderer/ActivityTrail'
import { ManyToOneField } from '@/fields/many-to-one/ManyToOneField'
import { ManyToOneListCell } from '@/fields/many-to-one/ManyToOneListCell'
import { SelectionField } from '@/fields/selection/SelectionField'
import { SelectionListCell } from '@/fields/selection/SelectionListCell'
import type { ModelSchema, Tone } from '@/types/schema'

/**
 * Gallery sections for S-5's new pieces: a record's activity trail (every
 * kind of entry, and empty, loading, failed and long-history states), a
 * calculated status that reads as a chip, and a person named but never linked.
 * Dev-only, like the rest of the gallery.
 */

const noop = () => {}

const BILL = {
  verbose_name: 'bill',
  workflow: {
    field: 'state',
    states: [
      { value: 'draft', label: 'Draft', tone: 'neutral' },
      { value: 'posted', label: 'Posted', tone: 'positive' },
    ],
    path: ['draft', 'posted'],
    locked: ['posted'],
    transitions: [],
  },
  fields: {
    customer: { type: 'many_to_one', label: 'Customer', required: true, read_only: false, visible_when: null },
    due_date: { type: 'date', label: 'Due date', required: false, read_only: false, visible_when: null },
    amount_total: { type: 'currency', label: 'Total', required: false, read_only: true, visible_when: null },
    amount_paid: { type: 'currency', label: 'Paid', required: false, read_only: true, visible_when: null },
    reason: { type: 'longtext', label: 'Reason', required: false, read_only: false, visible_when: null },
    active: { type: 'boolean', label: 'Active', required: false, read_only: false, visible_when: null },
    state: {
      type: 'selection',
      label: 'State',
      required: true,
      read_only: true,
      visible_when: null,
      choices: [
        { value: 'draft', label: 'Draft' },
        { value: 'posted', label: 'Posted' },
      ],
    },
  },
} as unknown as Pick<ModelSchema, 'fields' | 'workflow' | 'verbose_name'>

const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()

const SAMPLE: ActivityEntry[] = [
  {
    id: 9,
    timestamp: at(0.2),
    action: 'update',
    summary: 'Payment PAY-2026-00012 allocated {money:420000.00}',
    actor: { id: 4, display_name: 'Imran Siddiqui' },
    changes: { amount_paid: { before: '0.00', after: '420000.00' } },
  },
  {
    id: 8,
    timestamp: at(2),
    action: 'update',
    summary: '',
    actor: { id: 2, display_name: 'Ayesha Khan' },
    changes: { due_date: { before: '2026-01-16', after: '2026-01-30' } },
  },
  {
    id: 7,
    timestamp: at(5),
    action: 'update',
    summary: '',
    actor: { id: 2, display_name: 'Ayesha Khan' },
    changes: {
      customer: { before: 3, after: 7, before_label: 'Southern Gas Co. (demo)', after_label: 'Karachi Power Co. (demo)' },
      reason: { before: null, after: 'Meter replaced; account moved to the new owner' },
    },
  },
  {
    id: 6,
    timestamp: at(26),
    action: 'transition',
    summary: '',
    actor: { id: 2, display_name: 'Bilal Ahmed' },
    changes: { state: { before: 'draft', after: 'posted' } },
  },
  {
    id: 5,
    timestamp: at(26.1),
    action: 'update',
    summary: '',
    actor: { id: 2, display_name: 'Bilal Ahmed' },
    changes: { amount_total: { before: '0.00', after: '1245000.00' } },
  },
  {
    id: 4,
    timestamp: at(49),
    action: 'create',
    summary: 'Opened by Clicker automation: {money:2450000.00} owed, oldest bill 202 days overdue',
    actor: { id: 1, display_name: 'Clicker automation' },
    changes: {},
  },
  {
    id: 3,
    timestamp: at(50),
    action: 'update',
    summary: '',
    actor: { id: 2, display_name: 'Bilal Ahmed' },
    changes: { active: { before: true, after: false }, customer: { before: 3, after: null, before_label: null, after_label: null } },
  },
  {
    id: 1,
    timestamp: at(72),
    action: 'create',
    summary: '',
    actor: { id: 2, display_name: 'Bilal Ahmed' },
    changes: { customer: { before: null, after: 3 } },
  },
]

const LONG: ActivityEntry[] = Array.from({ length: 31 }, (_, index) => ({
  id: 100 + index,
  timestamp: at(index * 9 + 1),
  action: 'update' as const,
  summary: '',
  actor: { id: 2, display_name: index % 3 ? 'Sana Malik' : 'Bilal Ahmed' },
  changes: { due_date: { before: `2026-0${(index % 8) + 1}-10`, after: `2026-0${(index % 8) + 1}-${10 + (index % 18)}` } },
}))

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

function Example({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="gallery__record">
      <figcaption className="gallery__record-caption">{caption}</figcaption>
      <div className="gallery__s4-stage">{children}</div>
    </figure>
  )
}

const STATUS_CHOICES = [
  { value: 'not_paid', label: 'Not paid' },
  { value: 'partly_paid', label: 'Partly paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
]
const STATUS_TONES: Record<string, Tone> = { not_paid: 'neutral', partly_paid: 'info', paid: 'positive', overdue: 'danger' }

export function S5Sections() {
  return (
    <>
      <Section name="activity" label="A record’s history as sentences: who did what, before → after" id="activity">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Every kind of entry</h3>
          <div className="gallery__records">
            <Example caption="A bill’s trail: an allocation, an edit, a link and a note changed together, a move, a total, an automation, a person-less value, a creation">
              <ActivityList entries={SAMPLE} schema={BILL} />
            </Example>
            <Example caption="Empty (nothing recorded, for a record that predates the trail)">
              <ActivityList entries={[]} schema={BILL} />
            </Example>
            <Example caption="Loading">
              <ActivityList entries={[]} schema={BILL} status="loading" />
            </Example>
            <Example caption="Couldn’t load">
              <ActivityList entries={[]} schema={BILL} status="error" message="Could not reach the API." onRetry={noop} />
            </Example>
            <Example caption="Long history: the newest eight, then “Show all 31”">
              <ActivityList entries={LONG} schema={BILL} />
            </Example>
          </div>
        </div>
      </Section>

      <Section name="selection · tones" label="A calculated status reads as a chip, in the schema’s tone" id="status">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Payment status</h3>
          <div className="gallery__records gallery__records--grid">
            {STATUS_CHOICES.map((choice) => (
              <Example key={choice.value} caption={`Form (read-only) and list cell: ${choice.label}`}>
                <SelectionField
                  name={`s-${choice.value}`}
                  label="Payment status"
                  value={choice.value}
                  choices={STATUS_CHOICES}
                  tones={STATUS_TONES}
                  readOnly
                  onChange={noop}
                />
                <SelectionListCell value={choice.value} choices={STATUS_CHOICES} tones={STATUS_TONES} />
              </Example>
            ))}
            <Example caption="No status (a draft or a cancelled bill)">
              <SelectionField name="s-none" label="Payment status" value={null} choices={STATUS_CHOICES} tones={STATUS_TONES} readOnly onChange={noop} />
              <SelectionListCell value={null} choices={STATUS_CHOICES} tones={STATUS_TONES} />
            </Example>
          </div>
        </div>
      </Section>

      <Section name="many_to_one · person" label="A person is named, never linked: who requested, who owns" id="person">
        <div className="gallery__section">
          <h3 className="gallery__section-title">Requested by</h3>
          <div className="gallery__records gallery__records--grid">
            <Example caption="Form (read-only) and list cell">
              <ManyToOneField
                name="p"
                label="Requester"
                value={5}
                displayValue="Bilal Ahmed"
                person
                readOnly
                target={{ app_label: 'auth', model: 'user' }}
                onChange={noop}
              />
              <ManyToOneListCell label="Bilal Ahmed" id={5} />
            </Example>
            <Example caption="Not asked yet">
              <ManyToOneField name="p2" label="Requester" value={null} displayValue={null} person readOnly target={{ app_label: 'auth', model: 'user' }} onChange={noop} />
              <ManyToOneListCell label={null} />
            </Example>
          </div>
        </div>
      </Section>
    </>
  )
}
