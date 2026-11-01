import { Archive, ArchiveRestore, CloudOff, FileQuestion, Inbox, LockKeyhole, Plus, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { StatePanel } from '@/components/StatePanel'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { archiveConsequence } from '@/features/form-renderer/FormRenderer'
import { WorkflowBar } from '@/features/workflow/WorkflowBar'
import '@/features/form-renderer/FormRenderer.css'
import type { RecordWorkflow } from '@/types/record'
import type { Tone, WorkflowSchema } from '@/types/schema'

/**
 * Gallery sections for S-3: the workflow header in every state of both
 * shapes S-5 needs (a bill, a reduction), as each role sees it; the state
 * chips; the archive flow; and the empty, error, 403 and 404 states. The
 * schemas here are what the backend sends for the lab models
 * (backend/workflowlab), so the gallery and the real screens can't drift.
 */

const BILL_STATES = [
  { value: 'draft', label: 'Draft', tone: 'neutral' as Tone },
  { value: 'posted', label: 'Posted', tone: 'positive' as Tone },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' as Tone, after: 'draft' },
]

const POST = {
  name: 'post',
  label: 'Post',
  from: ['draft'],
  to: 'posted',
  hint: 'Once posted, it can’t be edited, only reversed.',
}
const CANCEL = {
  name: 'cancel',
  label: 'Cancel',
  from: ['draft'],
  to: 'cancelled',
  confirm: 'It keeps its number and can’t be posted afterwards.',
}

const bill = (transitions: WorkflowSchema['transitions']): WorkflowSchema => ({
  field: 'state',
  states: BILL_STATES,
  path: ['draft', 'posted'],
  locked: ['posted', 'cancelled'],
  transitions,
})

const ADJUSTMENT_STATES = [
  { value: 'draft', label: 'Draft', tone: 'neutral' as Tone },
  { value: 'requested', label: 'Requested', tone: 'warning' as Tone },
  { value: 'approved', label: 'Approved', tone: 'positive' as Tone },
  { value: 'rejected', label: 'Rejected', tone: 'danger' as Tone, after: 'requested' },
]

const REQUEST = {
  name: 'request',
  label: 'Request approval',
  from: ['draft'],
  to: 'requested',
  hint: 'This goes to a Manager for approval.',
}
const APPROVE = { name: 'approve', label: 'Approve', from: ['requested'], to: 'approved' }
const REJECT = {
  name: 'reject',
  label: 'Reject',
  from: ['requested'],
  to: 'rejected',
  confirm: 'The requester will see it was rejected. It can’t be requested again.',
}

const adjustment = (transitions: WorkflowSchema['transitions']): WorkflowSchema => ({
  field: 'state',
  states: ADJUSTMENT_STATES,
  path: ['draft', 'requested', 'approved'],
  locked: ['requested', 'approved', 'rejected'],
  transitions,
})

const status = (overrides: Partial<RecordWorkflow>): RecordWorkflow => ({
  available: [],
  locked: false,
  locked_reason: null,
  waiting: null,
  ...overrides,
})

const lockedAs = (verbose: string, label: string) => `This ${verbose} is ${label}, so it can’t be edited.`

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

function Group({ title, grid, children }: { title: string; grid?: boolean; children: ReactNode }) {
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">{title}</h3>
      <div className={grid ? 'gallery__records gallery__records--grid' : 'gallery__records'}>{children}</div>
    </div>
  )
}

/** A record's header as the form draws it, so the bar is judged in place. */
function RecordHead({
  caption,
  title,
  id,
  model,
  state,
  children,
  actions,
}: {
  caption: string
  title: string
  id: string
  model: string
  state?: { label: string; tone: Tone }
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <figure className="gallery__record">
      <figcaption className="gallery__record-caption">{caption}</figcaption>
      <div className="form-sheet gallery__record-sheet">
        <header className="form-header">
          <div className="form-header__text">
            <div className="form-header__headline">
              <h1 className="form-header__title">{title}</h1>
              {state && <StatusChip label={state.label} tone={state.tone} />}
            </div>
            <p className="form-header__meta">
              <span className="form-header__model">{model}</span>
              <span className="form-header__id">{id}</span>
            </p>
          </div>
          {actions && <div className="form-header__actions">{actions}</div>}
        </header>
        {children}
      </div>
    </figure>
  )
}

function BillStates() {
  const verbose = 'lab bill'
  return (
    <Group title="A bill: Draft → Posted, Cancelled as an exit">
      <RecordHead caption="New, before saving (Clerk)" title="New lab bill" id="" model="Lab bills">
        <WorkflowBar workflow={bill([POST])} state="draft" verboseName={verbose} />
      </RecordHead>
      <RecordHead caption="Draft (Clerk: may post, may not cancel)" title="Indus Traders" id="BILL-2026-00014" model="Lab bills" state={BILL_STATES[0]}>
        <WorkflowBar workflow={bill([POST])} state="draft" status={status({ available: ['post'] })} verboseName={verbose} />
      </RecordHead>
      <RecordHead caption="Draft (Manager: post, or cancel as the quieter choice)" title="Indus Traders" id="BILL-2026-00014" model="Lab bills" state={BILL_STATES[0]}>
        <WorkflowBar workflow={bill([POST, CANCEL])} state="draft" status={status({ available: ['post', 'cancel'] })} verboseName={verbose} />
      </RecordHead>
      <RecordHead caption="Draft with unsaved edits" title="Indus Traders" id="BILL-2026-00014" model="Lab bills" state={BILL_STATES[0]}>
        <WorkflowBar workflow={bill([POST])} state="draft" status={status({ available: ['post'] })} verboseName={verbose} dirty />
      </RecordHead>
      <RecordHead caption="Posting (request in flight)" title="Indus Traders" id="BILL-2026-00014" model="Lab bills" state={BILL_STATES[0]}>
        <WorkflowBar workflow={bill([POST, CANCEL])} state="draft" status={status({ available: ['post', 'cancel'] })} verboseName={verbose} running="post" />
      </RecordHead>
      <RecordHead caption="Posted (anyone)" title="Indus Traders" id="BILL-2026-00014" model="Lab bills" state={BILL_STATES[1]}>
        <WorkflowBar
          workflow={bill([POST])}
          state="posted"
          status={status({ locked: true, locked_reason: lockedAs(verbose, 'Posted') })}
          verboseName={verbose}
        />
      </RecordHead>
      <RecordHead caption="Cancelled" title="Karachi Cold Storage" id="BILL-2026-00009" model="Lab bills" state={BILL_STATES[2]}>
        <WorkflowBar
          workflow={bill([POST])}
          state="cancelled"
          status={status({ locked: true, locked_reason: lockedAs(verbose, 'Cancelled') })}
          verboseName={verbose}
        />
      </RecordHead>
    </Group>
  )
}

function AdjustmentStates() {
  const verbose = 'lab adjustment'
  return (
    <Group title="A reduction: Draft → Requested → Approved, Rejected as an exit">
      <RecordHead caption="New, before saving (Clerk): feedforward on who it goes to" title="New lab adjustment" id="" model="Lab adjustments">
        <WorkflowBar workflow={adjustment([REQUEST])} state="draft" verboseName={verbose} />
      </RecordHead>
      <RecordHead caption="Draft (Clerk): the rule before they submit" title="Damaged stock returned" id="ADJ-2026-00003" model="Lab adjustments" state={ADJUSTMENT_STATES[0]}>
        <WorkflowBar workflow={adjustment([REQUEST])} state="draft" status={status({ available: ['request'] })} verboseName={verbose} />
      </RecordHead>
      <RecordHead caption="Requested (Clerk who requested it)" title="Damaged stock returned" id="ADJ-2026-00003" model="Lab adjustments" state={ADJUSTMENT_STATES[1]}>
        <WorkflowBar
          workflow={adjustment([REQUEST])}
          state="requested"
          status={status({
            locked: true,
            locked_reason: lockedAs(verbose, 'Requested'),
            waiting: 'Waiting for a Manager to approve or reject it.',
          })}
          verboseName={verbose}
        />
      </RecordHead>
      <RecordHead caption="Requested (a Manager who requested it themselves)" title="Damaged stock returned" id="ADJ-2026-00003" model="Lab adjustments" state={ADJUSTMENT_STATES[1]}>
        <WorkflowBar
          workflow={adjustment([REQUEST, APPROVE, REJECT])}
          state="requested"
          status={status({
            locked: true,
            locked_reason: lockedAs(verbose, 'Requested'),
            waiting: 'You’re its requester, so another Manager has to approve or reject it.',
          })}
          verboseName={verbose}
        />
      </RecordHead>
      <RecordHead caption="Requested (another Manager)" title="Damaged stock returned" id="ADJ-2026-00003" model="Lab adjustments" state={ADJUSTMENT_STATES[1]}>
        <WorkflowBar
          workflow={adjustment([REQUEST, APPROVE, REJECT])}
          state="requested"
          status={status({ available: ['approve', 'reject'], locked: true, locked_reason: lockedAs(verbose, 'Requested') })}
          verboseName={verbose}
        />
      </RecordHead>
      <RecordHead caption="Approved" title="Damaged stock returned" id="ADJ-2026-00003" model="Lab adjustments" state={ADJUSTMENT_STATES[2]}>
        <WorkflowBar
          workflow={adjustment([REQUEST])}
          state="approved"
          status={status({ locked: true, locked_reason: lockedAs(verbose, 'Approved') })}
          verboseName={verbose}
        />
      </RecordHead>
      <RecordHead caption="Rejected" title="Goodwill discount, March" id="ADJ-2026-00002" model="Lab adjustments" state={ADJUSTMENT_STATES[3]}>
        <WorkflowBar
          workflow={adjustment([REQUEST])}
          state="rejected"
          status={status({ locked: true, locked_reason: lockedAs(verbose, 'Rejected') })}
          verboseName={verbose}
        />
      </RecordHead>
    </Group>
  )
}

function Chips() {
  const tones: { label: string; tone: Tone }[] = [
    { label: 'Draft', tone: 'neutral' },
    { label: 'Requested', tone: 'warning' },
    { label: 'Approved', tone: 'positive' },
    { label: 'Rejected', tone: 'danger' },
    { label: 'Scheduled', tone: 'info' },
    { label: 'Archived', tone: 'neutral' },
    { label: 'Awaiting customs examination at the terminal', tone: 'warning' },
  ]
  return (
    <div className="gallery__section">
      <h3 className="gallery__section-title">State chips (tone from the schema, never from the word)</h3>
      <div className="gallery__chips">
        {tones.map((chip) => (
          <span key={chip.label} className="gallery__chip-slot">
            <StatusChip {...chip} />
          </span>
        ))}
      </div>
    </div>
  )
}

function ArchiveFlow() {
  const contact = { verbose_name: 'contact', verbose_name_plural: 'contacts' }
  return (
    <Group title="Archive">
      <RecordHead
        caption="A Manager sees Archive (it's an edit of a field the Clerk can't write)"
        title="Acme Corporation"
        id="#12"
        model="Contacts"
        actions={
          <Button type="button" variant="ghost" className="h-[var(--control-height)] text-[color:var(--text-secondary)]">
            <Archive className="size-4" aria-hidden />
            Archive
          </Button>
        }
      />
      <figure className="gallery__record">
        <figcaption className="gallery__record-caption">The confirmation names the record and says the consequence</figcaption>
        <div className="gallery__dialog" role="presentation">
          <p className="gallery__dialog-title">Archive Acme Corporation?</p>
          <p className="gallery__dialog-body">{archiveConsequence(contact)}</p>
          <div className="gallery__dialog-actions">
            <Button variant="outline" className="h-[var(--control-height)]">
              Go back
            </Button>
            <Button className="h-[var(--control-height)]">Archive</Button>
          </div>
        </div>
      </figure>
      <RecordHead caption="Archived (Manager)" title="Acme Corporation" id="#12" model="Contacts" state={{ label: 'Archived', tone: 'neutral' }}>
        <div className="form-notice" role="status">
          <Archive className="form-notice__icon" aria-hidden />
          <p className="form-notice__text">
            Archived. It’s out of the contacts list and pickers; anything that points at it still does.
          </p>
          <Button type="button" variant="outline" className="h-[var(--control-height)]">
            <ArchiveRestore className="size-4" aria-hidden />
            Restore
          </Button>
        </div>
        <div style={{ height: 'var(--space-6)' }} />
      </RecordHead>
    </Group>
  )
}

function Panels() {
  const frame = (caption: string, panel: ReactNode) => (
    <figure className="gallery__record">
      <figcaption className="gallery__record-caption">{caption}</figcaption>
      <div className="form-sheet gallery__record-sheet">{panel}</div>
    </figure>
  )
  return (
    <Group title="Empty, no match, error, 403, 404" grid>
      {frame(
        'Empty list, may create',
        <StatePanel icon={Inbox} title="No lab bills yet" message="Add the first lab bill and it will show up here.">
          <Button className="h-[var(--control-height)]">
            <Plus className="size-4" aria-hidden />
            New lab bill
          </Button>
        </StatePanel>,
      )}
      {frame(
        'Empty list, may not create',
        <StatePanel icon={Inbox} title="No lab bills yet" message="When someone adds a lab bill, it will show up here." />,
      )}
      {frame(
        'No match',
        <StatePanel icon={SearchX} title="No contacts match “zzq”" message="Search looks in Name, Email, Phone, Tax ID.">
          <Button variant="outline" className="h-[var(--control-height)]">
            Clear search
          </Button>
        </StatePanel>,
      )}
      {frame(
        'No archived records',
        <StatePanel
          icon={Archive}
          title="No archived contacts"
          message="Archiving a contact takes it out of the list without deleting it. Archived ones show up here."
        >
          <Button variant="outline" className="h-[var(--control-height)]">
            Back to contacts
          </Button>
        </StatePanel>,
      )}
      {frame(
        'Couldn’t load (network or server)',
        <StatePanel icon={CloudOff} tone="danger" title="Couldn’t load contacts" message="Could not reach the API.">
          <Button variant="outline" className="h-[var(--control-height)]">
            Try again
          </Button>
        </StatePanel>,
      )}
      {frame(
        '403: may see, may not add',
        <StatePanel
          icon={LockKeyhole}
          title="You can’t add products"
          message="Your role lets you see products but not add them. Someone who manages access can change that."
        >
          <Button variant="outline" className="h-[var(--control-height)]">
            Back to products
          </Button>
        </StatePanel>,
      )}
      {frame(
        '404: missing, or not yours to see (the same answer, on purpose)',
        <StatePanel icon={FileQuestion} title="This record isn’t available" message="It doesn’t exist, or you don’t have access to it.">
          <Button variant="outline" className="h-[var(--control-height)]">
            Back to contacts
          </Button>
        </StatePanel>,
      )}
    </Group>
  )
}

export function S3Sections() {
  return (
    <>
      <Section name="workflow" label="Schema.workflow: a stepper, the next step in words, one primary button" id="workflow">
        <BillStates />
        <AdjustmentStates />
        <Chips />
      </Section>
      <Section name="archive" label="Schema.archive_field: confirm by name, restore any time" id="archive">
        <ArchiveFlow />
      </Section>
      <Section name="states" label="StatePanel: what a screen says when there's nothing to show" id="states">
        <Panels />
      </Section>
    </>
  )
}
