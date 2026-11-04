import { Check, Clock, LockKeyhole, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RecordWorkflow } from '@/types/record'
import type { WorkflowSchema, WorkflowState, WorkflowTransition } from '@/types/schema'
import './WorkflowBar.css'

/**
 * A record's workflow, under its header: where it is (a stepper along the
 * schema's `path`), and what happens next, in words, with one primary
 * button. Props in, events out: it never calls the API itself.
 *
 * Only transitions the user's schema allows ever appear, and only the ones
 * available on this record now. A step that belongs to someone else is
 * never a disabled button; it's a sentence saying whose it is ("Waiting for
 * a Manager to approve or reject it.").
 */
export function WorkflowBar({
  workflow,
  state,
  status,
  verboseName,
  running = null,
  dirty = false,
  onRun,
}: {
  workflow: WorkflowSchema
  /** The record's state value; for a new record, the field's default. */
  state: string
  /** The record's envelope `workflow`. Absent for a record not saved yet. */
  status?: RecordWorkflow
  verboseName: string
  /** The transition being run, if any. */
  running?: string | null
  /** Unsaved edits: transitions wait until they're saved. */
  dirty?: boolean
  onRun?: (transition: WorkflowTransition) => void
}) {
  const available = status
    ? workflow.transitions.filter((t) => status.available.includes(t.name))
    : []
  const ahead = (t: WorkflowTransition) => workflow.path.indexOf(t.to) > workflow.path.indexOf(state)
  const primary = available.find(ahead) ?? available[0]
  const secondary = available.filter((t) => t !== primary)

  return (
    <div className="workflow-bar">
      <Stepper workflow={workflow} state={state} />
      <div className="workflow-bar__next">
        <NextStep
          workflow={workflow}
          state={state}
          status={status}
          verboseName={verboseName}
          available={available}
          primary={primary}
          dirty={dirty}
        />
        {status && !dirty && available.length > 0 && (
          <div className="workflow-bar__actions">
            {secondary.map((t) => (
              <Button
                key={t.name}
                type="button"
                variant="outline"
                disabled={running != null}
                onClick={() => onRun?.(t)}
                className="h-[var(--control-height)]"
              >
                {running === t.name ? `${t.label}…` : t.label}
              </Button>
            ))}
            {primary && (
              <Button
                type="button"
                disabled={running != null}
                onClick={() => onRun?.(primary)}
                className="h-[var(--control-height)]"
              >
                {running === primary.name ? `${primary.label}…` : primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function NextStep({
  workflow,
  state,
  status,
  verboseName,
  available,
  primary,
  dirty,
}: {
  workflow: WorkflowSchema
  state: string
  status?: RecordWorkflow
  verboseName: string
  available: WorkflowTransition[]
  primary?: WorkflowTransition
  dirty: boolean
}) {
  // Not saved yet: say where it starts and, before anyone commits to it,
  // what comes after (for a reduction: who it will go to).
  if (!status) {
    const first = stateOf(workflow, state)
    const next = workflow.transitions.find((t) => t.from.includes(state))
    return (
      <Sentence
        lead={`Saved as ${article(first.label)} ${first.label.toLowerCase()} first.`}
        detail={next ? [`Then: ${next.label}.`, next.hint].filter(Boolean).join(' ') : null}
      />
    )
  }
  if (available.length > 0) {
    if (dirty) {
      return (
        <Sentence
          lead={`Save your changes before you ${either(available.map((t) => t.label))}.`}
          detail={primary?.hint}
        />
      )
    }
    return (
      <Sentence
        lead={`Ready to ${either(available.map((t) => t.label))}.`}
        detail={[primary?.hint, ...(status.held_back ?? [])].filter(Boolean).join(' ') || null}
      />
    )
  }
  if (status.waiting) {
    return <Sentence icon={Clock} lead={status.waiting} detail={status.locked_reason} />
  }
  if (status.locked_reason) {
    return <Sentence icon={LockKeyhole} lead={status.locked_reason} detail={status.held_back?.join(' ') || null} />
  }
  return <Sentence lead={`This ${verboseName} is ${stateOf(workflow, state).label.toLowerCase()}.`} />
}

function Sentence({
  icon: Icon,
  lead,
  detail,
}: {
  icon?: typeof Clock
  lead: string
  detail?: string | null
}) {
  return (
    <div className="workflow-bar__sentence">
      <p className="workflow-bar__lead">
        {Icon && <Icon className="workflow-bar__lead-icon" aria-hidden />}
        {lead}
      </p>
      {detail && <p className="workflow-bar__detail">{detail}</p>}
    </div>
  )
}

type Step = { state: WorkflowState; status: 'done' | 'current' | 'todo' | 'exit' }

/**
 * The path, with the record's place on it. An exit (Cancelled, Rejected)
 * replaces the rest of the path after the step it left from, so the stepper
 * shows how far it got, not steps it will never reach.
 */
export function stepsFor(workflow: WorkflowSchema, state: string): Step[] {
  const at = workflow.path.indexOf(state)
  if (at >= 0) {
    return workflow.path.map((value, i) => ({
      state: stateOf(workflow, value),
      status: i < at ? 'done' : i === at ? 'current' : 'todo',
    }))
  }
  const exit = stateOf(workflow, state)
  const leftFrom = exit.after ? workflow.path.indexOf(exit.after) : -1
  return [
    ...workflow.path.slice(0, leftFrom + 1).map((value) => ({ state: stateOf(workflow, value), status: 'done' as const })),
    { state: exit, status: 'exit' },
  ]
}

function Stepper({ workflow, state }: { workflow: WorkflowSchema; state: string }) {
  const steps = stepsFor(workflow, state)
  const last = steps.length - 1
  return (
    <ol className="workflow-steps" aria-label="Progress">
      {steps.map((step, i) => (
        <li
          key={step.state.value}
          className={cn('workflow-step', `workflow-step--${step.status}`, `workflow-step--${step.state.tone}`)}
          aria-current={step.status === 'current' || step.status === 'exit' ? 'step' : undefined}
        >
          <span className="workflow-step__marker" aria-hidden>
            {step.status === 'done' && <Check />}
            {step.status === 'exit' && <X />}
            {step.status === 'current' && i === last && step.state.tone === 'positive' && <Check />}
          </span>
          <span className="workflow-step__label">{step.state.label}</span>
          {i < last && <span className="workflow-step__line" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

function stateOf(workflow: WorkflowSchema, value: string): WorkflowState {
  return workflow.states.find((s) => s.value === value) ?? { value, label: value, tone: 'neutral' }
}

/** ['Post', 'Cancel'] → 'post or cancel'. */
function either(labels: string[]) {
  const lower = labels.map((label) => label.charAt(0).toLowerCase() + label.slice(1))
  return lower.length < 2 ? (lower[0] ?? '') : `${lower.slice(0, -1).join(', ')} or ${lower[lower.length - 1]}`
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}
