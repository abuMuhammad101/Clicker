import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RecordWorkflow } from '@/types/record'
import type { WorkflowSchema } from '@/types/schema'
import { stepsFor, WorkflowBar } from './WorkflowBar'

const REQUEST = { name: 'request', label: 'Request approval', from: ['draft'], to: 'requested', hint: 'This goes to a Manager for approval.' }
const APPROVE = { name: 'approve', label: 'Approve', from: ['requested'], to: 'approved' }
const REJECT = { name: 'reject', label: 'Reject', from: ['requested'], to: 'rejected', confirm: 'Sure?' }

const workflow = (transitions: WorkflowSchema['transitions']): WorkflowSchema => ({
  field: 'state',
  states: [
    { value: 'draft', label: 'Draft', tone: 'neutral' },
    { value: 'requested', label: 'Requested', tone: 'warning' },
    { value: 'approved', label: 'Approved', tone: 'positive' },
    { value: 'rejected', label: 'Rejected', tone: 'danger', after: 'requested' },
  ],
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

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])

describe('WorkflowBar', () => {
  it('offers the next step as one primary button and says what it does', () => {
    const html = renderToStaticMarkup(
      <WorkflowBar workflow={workflow([REQUEST])} state="draft" status={status({ available: ['request'] })} verboseName="adjustment" />,
    )
    expect(buttons(html)).toEqual(['Request approval'])
    expect(html).toContain('Ready to request approval.')
    expect(html).toContain('This goes to a Manager for approval.')
  })

  it('says "this job" once when every available step is about the same record', () => {
    const GATE = { name: 'gate_out', label: 'Gate out', phrase: 'gate out this job', from: ['draft'], to: 'approved' }
    const CANCEL = { name: 'cancel', label: 'Cancel job', phrase: 'cancel this job', from: ['draft'], to: 'rejected' }
    const html = renderToStaticMarkup(
      <WorkflowBar workflow={workflow([GATE, CANCEL])} state="draft" status={status({ available: ['gate_out', 'cancel'] })} verboseName="job" />,
    )
    expect(html).toContain('Ready to gate out or cancel this job.')
  })

  it('never shows a step that is someone else’s as a button; it says whose it is', () => {
    const html = renderToStaticMarkup(
      <WorkflowBar
        workflow={workflow([REQUEST])}
        state="requested"
        status={status({ locked: true, locked_reason: 'Locked.', waiting: 'Waiting for a Manager to approve or reject this adjustment.' })}
        verboseName="adjustment"
      />,
    )
    expect(buttons(html)).toEqual([])
    expect(html).toContain('Waiting for a Manager to approve or reject this adjustment.')
  })

  it('shows only the transitions available now, the forward one as primary', () => {
    const html = renderToStaticMarkup(
      <WorkflowBar
        workflow={workflow([REQUEST, APPROVE, REJECT])}
        state="requested"
        status={status({ available: ['approve', 'reject'] })}
        verboseName="adjustment"
      />,
    )
    // Secondary first, primary last (rightmost).
    expect(buttons(html)).toEqual(['Reject', 'Approve'])
  })

  it('asks for unsaved edits to be saved instead of offering transitions', () => {
    const html = renderToStaticMarkup(
      <WorkflowBar workflow={workflow([REQUEST])} state="draft" status={status({ available: ['request'] })} verboseName="adjustment" dirty />,
    )
    expect(buttons(html)).toEqual([])
    expect(html).toContain('Save your changes before you request approval.')
  })

  it('tells a new record where it starts and what comes after, before it is saved', () => {
    const html = renderToStaticMarkup(<WorkflowBar workflow={workflow([REQUEST])} state="draft" verboseName="adjustment" />)
    expect(buttons(html)).toEqual([])
    expect(html).toContain('Saved as a draft first.')
    expect(html).toContain('Then: Request approval. This goes to a Manager for approval.')
  })
})

describe('stepsFor', () => {
  it('marks the steps before the current one done', () => {
    expect(stepsFor(workflow([]), 'requested').map((s) => s.status)).toEqual(['done', 'current', 'todo'])
  })

  it('puts an exit after the step it left from and drops the steps it will never reach', () => {
    const steps = stepsFor(workflow([]), 'rejected')
    expect(steps.map((s) => [s.state.value, s.status])).toEqual([
      ['draft', 'done'],
      ['requested', 'done'],
      ['rejected', 'exit'],
    ])
  })
})
