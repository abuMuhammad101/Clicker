import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Archive, ArchiveRestore, CloudOff, FileQuestion, LockKeyhole } from 'lucide-react'
import { StatePanel } from '@/components/StatePanel'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { renderFormField } from '@/fields/registry'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import { formatDateTime, relativeTime } from '@/lib/dates'
import { Link } from '@/lib/Link'
import { navigate, useNavigationBlocker } from '@/lib/router'
import { toast } from '@/lib/toast'
import { emitRecordChanged, listPath, useRecordChanged } from '@/records'
import { useModelSchema } from '@/lib/useModelSchema'
import { isVisible } from '@/lib/visibility'
import type { RecordEnvelope } from '@/types/record'
import type { ModelSchema, WorkflowTransition } from '@/types/schema'
import { WorkflowBar } from '../workflow/WorkflowBar'
import { ActivityTrail } from './ActivityTrail'
import { RelatedLists } from './RelatedLists'
import './FormRenderer.css'

/**
 * Renders any exposed model's form from its schema. Nothing in this folder
 * may know which model it is showing — if a form needs model-specific
 * behaviour, that behaviour belongs in the model's `Schema` class and the
 * schema engine, and this file only learns the new generic capability.
 */
/**
 * What a form tells whatever contains it, so the container can draw a save bar
 * in its own header. `save` and `discard` are commands back: `discard` asks the
 * form to discard, and the form still confirms with the user first. They are
 * the form's own save and discard, not copies.
 */
export interface FormState {
  dirty: boolean
  /** How many fields differ from what was loaded. */
  changes: number
  /** Whether this user may edit the record at all (the schema's `update` action). */
  canUpdate: boolean
  saving: boolean
  save: () => void
  discard: () => void
}

interface FormRendererProps {
  appLabel: string
  model: string
  /** Omit to create a new record. */
  recordId?: number
  /**
   * `view` renders every field read-only and hides Save/Discard; `edit` is the
   * default. Switching between them keeps the form mounted, so nothing typed
   * is lost. A new record has nothing to view: pass `edit`.
   */
  mode?: 'edit' | 'view'
  onSaved?: (record: RecordEnvelope) => void
  /**
   * What this form is showing, as a short label ("Emma Whitfield", "New
   * contact"), or null once there's nothing to show. The form never sets the
   * window title or a breadcrumb itself: whatever contains it decides where
   * a label goes, if anywhere.
   */
  onLabelChange?: (label: string | null) => void
  /** The form's dirty/saving state and its commands; null once it's gone. */
  onStateChange?: (state: FormState | null) => void
  /** Shown before the title (an icon or avatar). The container's, not the form's. */
  leading?: ReactNode
  /**
   * A new record's starting values, shown locked (e.g. `{parent: '5'}` for a
   * person added under a company). Raw strings, as they arrive in a URL; the
   * form converts each by its field's type. Ignored for an existing record.
   */
  prefill?: Record<string, string>
  /**
   * `inline` (default): Save and Discard sit in the form's own header.
   * `external`: the container draws them (see onStateChange), and the form
   * shows only its "Saved" confirmation.
   */
  actions?: 'inline' | 'external'
}

export function FormRenderer(props: FormRendererProps) {
  // Retry = remount. Schema and record fetches both restart from scratch,
  // with no stale partial state carried over from the failed attempt.
  const [attempt, setAttempt] = useState(0)
  return <FormSheet key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
}

type RecordState =
  | { status: 'loading' }
  | { status: 'error'; message: string; notFound: boolean }
  | { status: 'ready'; record: RecordEnvelope | null }

function FormSheet({
  appLabel,
  model,
  recordId,
  mode,
  onSaved,
  onLabelChange,
  onStateChange,
  leading,
  prefill,
  actions,
  onRetry,
}: FormRendererProps & { onRetry: () => void }) {
  const schemaState = useModelSchema(appLabel, model)
  const [recordState, setRecordState] = useState<RecordState>(
    recordId == null ? { status: 'ready', record: null } : { status: 'loading' },
  )

  useEffect(() => {
    if (recordId == null) return
    let cancelled = false
    apiGet<RecordEnvelope>(`/data/${appLabel}/${model}/${recordId}/`)
      .then((record) => !cancelled && setRecordState({ status: 'ready', record }))
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof ApiError ? error.message : 'Could not reach the API.'
        setRecordState({ status: 'error', message, notFound: error instanceof ApiError && error.status === 404 })
      })
    return () => {
      cancelled = true
    }
  }, [appLabel, model, recordId])

  // A missing record waits for the schema, so its "Back to …" way out
  // arrives with it instead of popping in afterwards.
  const notFound =
    (schemaState.status === 'error' && schemaState.notFound) ||
    (recordState.status === 'error' && recordState.notFound && schemaState.status !== 'loading')
  const cannotCreate = recordId == null && schemaState.status === 'ready' && !schemaState.schema.actions.create
  const failed = !notFound && (schemaState.status === 'error' || recordState.status === 'error')
  // The states below name themselves too, so a breadcrumb never ends in "…".
  const stateLabel = notFound
    ? 'Not available'
    : cannotCreate && schemaState.status === 'ready'
      ? `New ${schemaState.schema.verbose_name}`
      : failed
        ? 'Couldn’t load'
        : null
  useEffect(() => {
    if (stateLabel == null) return
    onLabelChange?.(stateLabel)
    return () => onLabelChange?.(null)
  }, [stateLabel, onLabelChange])

  if (notFound) {
    return (
      <NotAvailable
        back={schemaState.status === 'ready' ? { to: listPath({ app_label: appLabel, model }), plural: schemaState.schema.verbose_name_plural } : null}
      />
    )
  }

  // 403: the model is visible, but this user may not add to it. Said before
  // they fill anything in, not after they press Save.
  if (cannotCreate && schemaState.status === 'ready') {
    return <CannotCreate appLabel={appLabel} model={model} schema={schemaState.schema} />
  }

  if (schemaState.status === 'error' || recordState.status === 'error') {
    const message =
      schemaState.status === 'error'
        ? schemaState.message
        : recordState.status === 'error'
          ? recordState.message
          : ''
    return <LoadError message={message} onRetry={onRetry} />
  }

  if (schemaState.status === 'loading') {
    return <SchemaSkeleton />
  }

  if (recordState.status === 'loading') {
    // The schema already says what the form looks like — show its real
    // structure (sections, labels) with each control in its loading state,
    // rather than a generic skeleton that then jumps into a different shape.
    return (
      <div className="form-sheet">
        <header className="form-header">
          <div className="form-header__text">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-1.5 h-3 w-24" />
          </div>
        </header>
        <FormBody schema={schemaState.schema} values={{}} labels={{}} errors={{}} loading />
      </div>
    )
  }

  return (
    <EditableForm
      // A new record uses what this user may set when creating
      // (read_only_on_create), not when editing an existing one.
      schema={recordState.record ? schemaState.schema : forCreate(schemaState.schema)}
      record={recordState.record}
      appLabel={appLabel}
      model={model}
      mode={mode}
      onSaved={onSaved}
      onLabelChange={onLabelChange}
      onStateChange={onStateChange}
      leading={leading}
      prefill={recordState.record ? undefined : prefill}
      actions={actions}
    />
  )
}

/** A prefill's raw strings as values of each field's own type. */
function coercePrefill(schema: ModelSchema, prefill: Record<string, string> | undefined) {
  if (!prefill) return {}
  const values: Record<string, unknown> = {}
  for (const [name, raw] of Object.entries(prefill)) {
    const field = schema.fields[name]
    if (!field) continue
    if (field.type === 'many_to_one' || field.type === 'integer') values[name] = Number(raw)
    else if (field.type === 'boolean') values[name] = raw === 'true'
    else values[name] = raw
  }
  return values
}

function forCreate(schema: ModelSchema): ModelSchema {
  return {
    ...schema,
    fields: Object.fromEntries(
      Object.entries(schema.fields).map(([name, field]) => [
        name,
        { ...field, read_only: field.read_only_on_create ?? field.read_only },
      ]),
    ),
  }
}

function initialValues(schema: ModelSchema, record: RecordEnvelope | null, prefill: Record<string, unknown> = {}) {
  if (record) return record.values
  // A new record starts from the schema's defaults, then any prefill. A
  // boolean with no default is false — a checkbox has no "empty".
  return Object.fromEntries(
    Object.entries(schema.fields).map(([name, field]) => [
      name,
      name in prefill ? prefill[name] : (field.default ?? (field.type === 'boolean' ? false : null)),
    ]),
  )
}

/**
 * Field-level dirty state: compared against `baseline` (what was loaded, or
 * the schema's defaults for a new record), not against some remembered
 * "has this ever been touched" flag — so reverting a field to its original
 * value makes it clean again, the same way undoing a typo would. read_only
 * fields (the auto pk) never count: nothing ever edits them.
 */
function dirtyFieldNames(
  schema: ModelSchema,
  values: Record<string, unknown>,
  baseline: Record<string, unknown>,
) {
  return new Set(
    Object.entries(schema.fields)
      .filter(([name, field]) => !field.read_only && !Object.is(values[name] ?? null, baseline[name] ?? null))
      .map(([name]) => name),
  )
}

function EditableForm({
  schema,
  record: initialRecord,
  appLabel,
  model,
  mode = 'edit',
  onSaved,
  onLabelChange,
  onStateChange,
  leading,
  prefill,
  actions = 'inline',
}: {
  schema: ModelSchema
  record: RecordEnvelope | null
  appLabel: string
  model: string
  mode?: 'edit' | 'view'
  onSaved?: (record: RecordEnvelope) => void
  onLabelChange?: (label: string | null) => void
  onStateChange?: (state: FormState | null) => void
  /** Shown before the title (an icon or avatar). The container's, not the form's. */
  leading?: ReactNode
  prefill?: Record<string, string>
  actions?: 'inline' | 'external'
}) {
  // A new record's prefilled values start it and stay locked: the form was
  // opened *for* that parent, so changing it here would be a different act.
  const [prefillValues] = useState(() => coercePrefill(schema, prefill))
  const [prefilled] = useState(() => new Set(initialRecord ? [] : Object.keys(prefillValues)))
  // Read-only when the container asks for it, and always when this user may
  // not edit the record: the schema's `update` action is the API's own answer.
  const canUpdate = schema.actions.update
  const [record, setRecord] = useState(initialRecord)
  // A record in a locked workflow state (posted, requested) reads like one
  // the user can't edit: the server would refuse the save anyway.
  const locked = record?.workflow?.locked === true
  // An archived record is read-only until it is restored: the server refuses
  // any other edit, so the form doesn't offer one.
  const archiveField = schema.archive_field ?? null
  const archived = record != null && archiveField != null && record.values[archiveField] === false
  const viewing = mode === 'view' || (record != null && (!canUpdate || locked || archived))
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialValues(schema, initialRecord, prefillValues),
  )
  // What the form would revert to: the loaded record's values, or a new
  // record's schema defaults. Reset to the server's response on every
  // successful save, which is what makes the form clean again afterward.
  const [baseline, setBaseline] = useState<Record<string, unknown>>(() =>
    initialValues(schema, initialRecord, prefillValues),
  )
  // Labels describe the values as loaded. Once a field is edited its loaded
  // label is stale (a cleared parent must not keep showing the old name),
  // so it's dropped; the picker shows its own pick's label until the next
  // save brings fresh labels from the server.
  const [labels, setLabels] = useState<Record<string, string | null>>(
    initialRecord?.labels ?? {},
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Set while an in-app link is held back pending the user's choice in the
  // unsaved-changes dialog — the href it would have gone to.
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)

  // A record this form points at was renamed somewhere else: its label here
  // follows, so "Country: United States" never lags behind the real name.
  useRecordChanged((change) => {
    setLabels((current) => {
      let next = current
      for (const [name, field] of Object.entries(schema.fields)) {
        const target = field.target
        if (
          field.type === 'many_to_one' &&
          target?.app_label === change.model.app_label &&
          target.model === change.model.model &&
          values[name] === change.record.id &&
          current[name] !== change.record.display
        ) {
          next = { ...next, [name]: change.record.display }
        }
      }
      return next
    })
  })

  // A prefilled link arrives as a bare id; ask the target's own search for
  // its name, so a locked "Parent" reads "Acme Corporation", not a number.
  useEffect(() => {
    let cancelled = false
    for (const name of prefilled) {
      const field = schema.fields[name]
      const id = values[name]
      if (field?.type !== 'many_to_one' || !field.target || typeof id !== 'number') continue
      apiGet<{ value: number; label: string }[]>(
        `/data/${field.target.app_label}/${field.target.model}/search/?id=${id}`,
      )
        .then((options) => {
          if (!cancelled && options[0]) setLabels((current) => ({ ...current, [name]: options[0].label }))
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
    // Only for the prefill the form opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirtyFields = dirtyFieldNames(schema, values, baseline)
  const isDirty = dirtyFields.size > 0
  const changeCount = dirtyFields.size

  const pageLabel = record ? record.display : `New ${schema.verbose_name}`
  useEffect(() => {
    onLabelChange?.(pageLabel)
    return () => onLabelChange?.(null)
  }, [pageLabel, onLabelChange])

  // Browser-level unload (close tab, reload, typed URL) gets the browser's
  // own blunt prompt — no modern browser allows replacing that text, so
  // there's no point trying. In-app navigation gets the richer
  // save/discard/cancel choice instead (useNavigationBlocker below).
  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const setValue = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }))
    setLabels((current) => (current[name] == null ? current : { ...current, [name]: null }))
    setJustSaved(false)
  }

  const save = async (): Promise<boolean> => {
    setSaving(true)
    setFieldErrors({})
    setFormErrors([])

    // Every editable field is sent, visible or not: hidden means not
    // applicable, not cleared — switching back must bring the value back.
    const payload = Object.fromEntries(
      Object.entries(schema.fields)
        .filter(([, field]) => !field.read_only)
        .map(([name]) => [name, values[name] ?? null]),
    )

    try {
      const saved = record
        ? await apiSend<RecordEnvelope>('PATCH', `/data/${appLabel}/${model}/${record.id}/`, payload)
        : await apiSend<RecordEnvelope>('POST', `/data/${appLabel}/${model}/`, payload)
      setRecord(saved)
      // The server's response is the new baseline, not just the new display
      // — a computed or server-modified field (a default filled in, a
      // normalised value) can differ from exactly what was sent.
      setValues(saved.values)
      setBaseline(saved.values)
      setLabels(saved.labels)
      setJustSaved(true)
      emitRecordChanged({ app_label: appLabel, model }, saved)
      onSaved?.(saved)
      return true
    } catch (error) {
      if (error instanceof ApiError && error.validation) {
        const mapped = mapValidationErrors(schema, values, error.validation)
        setFieldErrors(mapped.fieldErrors)
        setFormErrors(mapped.formErrors)
      } else {
        const message = error instanceof ApiError ? error.message : 'Could not reach the API.'
        setFormErrors([`Not saved: ${message}`])
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const discard = () => {
    toast({ kind: 'info', message: 'Changes discarded' })
    setValues(baseline)
    setLabels(record?.labels ?? {})
    setFieldErrors({})
    setFormErrors([])
    setJustSaved(false)
    // AlertDialogAction doesn't auto-close on its own — unlike Cancel, it's
    // meant for actions that might not be done yet (an async save, say),
    // so closing is always the consumer's call, not Radix's default.
    setConfirmDiscard(false)
  }

  // --- Workflow: running a transition ---------------------------------------
  const workflow = schema.workflow ?? null
  const [running, setRunning] = useState<string | null>(null)
  const [confirmTransition, setConfirmTransition] = useState<WorkflowTransition | null>(null)

  /**
   * Take a server envelope as the new truth (after a transition or archive).
   * Fields the user has changed and not saved keep their edits.
   */
  const accept = (saved: RecordEnvelope) => {
    setRecord(saved)
    setValues((current) =>
      Object.fromEntries(
        Object.entries(saved.values).map(([name, value]) => [name, dirtyFields.has(name) ? current[name] : value]),
      ),
    )
    setBaseline(saved.values)
    setLabels(saved.labels)
    // Not onSaved: a transition or an archive isn't a save, and the
    // container would announce it as one. Other views hear it from here.
    emitRecordChanged({ app_label: appLabel, model }, saved)
  }

  const runTransition = async (transition: WorkflowTransition) => {
    if (!record || !workflow) return
    setConfirmTransition(null)
    setRunning(transition.name)
    try {
      const saved = await apiSend<RecordEnvelope>(
        'POST',
        `/data/${appLabel}/${model}/${record.id}/transitions/${transition.name}/`,
      )
      accept(saved)
      const to = workflow.states.find((s) => s.value === transition.to)?.label ?? transition.to
      toast({ message: `${capitalize(schema.verbose_name)} ${to.toLowerCase()}` })
    } catch (error) {
      // 409/403: someone else moved it first, or it's no longer this user's
      // to move. Say so, and show where it actually is now.
      toast({ kind: 'error', message: error instanceof ApiError ? error.message : 'Could not reach the API.' })
      apiGet<RecordEnvelope>(`/data/${appLabel}/${model}/${record.id}/`).then(accept).catch(() => undefined)
    } finally {
      setRunning(null)
    }
  }

  const askToRun = (transition: WorkflowTransition) => {
    if (transition.confirm) setConfirmTransition(transition)
    else void runTransition(transition)
  }

  // --- Archive: an edit of the schema's archive field -----------------------
  const [confirmArchive, setConfirmArchive] = useState(false)

  const setArchived = async (archive: boolean) => {
    if (!record || !archiveField) return
    setConfirmArchive(false)
    try {
      const saved = await apiSend<RecordEnvelope>('PATCH', `/data/${appLabel}/${model}/${record.id}/`, {
        [archiveField]: !archive,
      })
      accept(saved)
      toast(
        archive
          ? { message: `${saved.display} archived`, action: { label: 'Undo', onClick: () => void setArchived(false) } }
          : { message: `${saved.display} restored` },
      )
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not reach the API.'
      toast({ kind: 'error', message: `Couldn’t ${archive ? 'archive' : 'restore'} ${record.display}. ${message}` })
    }
  }

  // The commands never change identity (they call the latest save/discard
  // through a ref), so a container holding this state isn't re-rendered into
  // a loop by it.
  const latest = useRef({ save, askToDiscard: () => setConfirmDiscard(true) })
  useEffect(() => {
    latest.current = { save, askToDiscard: () => setConfirmDiscard(true) }
  })
  const commands = useMemo(
    () => ({
      save: () => void latest.current.save(),
      discard: () => latest.current.askToDiscard(),
    }),
    [],
  )
  useEffect(() => {
    onStateChange?.({ dirty: isDirty, changes: changeCount, canUpdate, saving, ...commands })
    return () => onStateChange?.(null)
  }, [isDirty, changeCount, canUpdate, saving, commands, onStateChange])

  // Any in-app navigation while dirty — this header's link, the sidebar,
  // a breadcrumb, browser back/forward — is held back and routed through
  // the leave dialog below, with wherever it was headed.
  useNavigationBlocker(isDirty, setPendingNavigation)

  const handleSaveAndLeave = async () => {
    const destination = pendingNavigation
    const ok = await save()
    setPendingNavigation(null)
    if (ok && destination) navigate(destination, { force: true })
    // On failure the dialog closes, leaving the form on screen with its
    // errors showing — the same place a plain failed save lands.
  }

  const handleDiscardAndLeave = () => {
    const destination = pendingNavigation
    setPendingNavigation(null)
    if (destination) navigate(destination, { force: true })
  }

  return (
    <form
      className={cn('form-sheet', viewing && 'form-sheet--view')}
      onSubmit={(event) => {
        event.preventDefault()
        if (!viewing) void save()
      }}
      noValidate
    >
      <header className="form-header">
        {leading && <div className="form-header__lead">{leading}</div>}
        <div className="form-header__text">
          <div className="form-header__headline">
            <h1 className="form-header__title" title={record?.display}>
              {record ? record.display : `New ${schema.verbose_name}`}
            </h1>
            {record && workflow && <StateChip schema={schema} value={values[workflow.field]} />}
            {archived && <StatusChip label="Archived" />}
          </div>
          <p className="form-header__meta">
            <span className="form-header__model">{schema.verbose_name_plural}</span>
            {record && <span className="form-header__id">{documentNumber(schema, record) ?? `#${record.id}`}</span>}
            {record?.meta && (
              // Relative where it's glanced at; the exact time on hover.
              <span className="form-header__updated">
                Updated{' '}
                <time dateTime={record.meta.updated_at} title={formatDateTime(record.meta.updated_at)}>
                  {relativeTime(record.meta.updated_at)}
                </time>
                {record.meta.updated_by && ` by ${record.meta.updated_by.display_name}`}
              </span>
            )}
          </p>
        </div>
        <div className="form-header__actions">
          {justSaved && !viewing && <span className="form-header__status">Saved</span>}
          {record && schema.actions.archive && !archived && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmArchive(true)}
              className="h-[var(--control-height)] text-[color:var(--text-secondary)]"
            >
              <Archive className="size-4" aria-hidden />
              Archive
            </Button>
          )}
          {!viewing && actions === 'inline' && (
            <>
            <Button
              type="button"
              variant="outline"
              disabled={saving || !isDirty}
              onClick={() => setConfirmDiscard(true)}
              className="h-[var(--control-height)]"
            >
              Discard
            </Button>
            <Button type="submit" disabled={saving || !isDirty} className="h-[var(--control-height)]">
              {saving ? 'Saving…' : 'Save'}
            </Button>
            </>
          )}
        </div>
      </header>

      {workflow && (
        <WorkflowBar
          workflow={workflow}
          state={String(values[workflow.field] ?? schema.fields[workflow.field]?.default ?? workflow.path[0])}
          status={record?.workflow}
          verboseName={schema.verbose_name}
          running={running}
          dirty={isDirty}
          onRun={askToRun}
        />
      )}

      {archived && (
        <div className="form-notice" role="status">
          <Archive className="form-notice__icon" aria-hidden />
          <p className="form-notice__text">
            Archived. It’s out of the {schema.verbose_name_plural} list and pickers, and read-only until it’s restored;
            anything that points at it still does.
          </p>
          {schema.actions.archive && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void setArchived(false)}
              className="h-[var(--control-height)]"
            >
              <ArchiveRestore className="size-4" aria-hidden />
              Restore
            </Button>
          )}
        </div>
      )}

      {formErrors.length > 0 && (
        <div className="form-banner" role="alert">
          {formErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <FormBody
        schema={schema}
        values={values}
        labels={labels}
        errors={fieldErrors}
        dirtyFields={dirtyFields}
        readOnly={viewing}
        locked={prefilled}
        restricted={record?.restricted}
        onChange={setValue}
      />

      {record && schema.related_lists && schema.related_lists.length > 0 && (
        <RelatedLists
          // A transition or a save changes what the lists beside the record show (a posted
          // payment's allocations): a new version of the record is a fresh fetch of them.
          key={record.meta?.updated_at ?? record.id}
          parent={{ app_label: appLabel, model, id: record.id }}
          lists={schema.related_lists}
        />
      )}

      {record && (
        <ActivityTrail
          appLabel={appLabel}
          model={model}
          recordId={record.id}
          schema={schema}
          version={record.meta?.updated_at}
        />
      )}

      {/* A transition that asks first names the record and says the
          consequence. "Go back", not "Cancel": the transition itself may be
          called Cancel. */}
      <AlertDialog open={confirmTransition != null} onOpenChange={(open) => !open && setConfirmTransition(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTransition?.label} {record?.display}?
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmTransition?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmTransition && void runTransition(confirmTransition)}>
              {confirmTransition?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {record?.display}?</AlertDialogTitle>
            <AlertDialogDescription>{archiveConsequence(schema)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={() => void setArchived(true)}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {dirtyFields.size === 1 ? 'The field you changed' : `The ${dirtyFields.size} fields you changed`}{' '}
              will revert to {record ? 'their saved values' : 'blank'}. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={discard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingNavigation != null} onOpenChange={(open) => !open && setPendingNavigation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              You changed {[...dirtyFields].map((name) => schema.fields[name]?.label ?? name).join(', ')}.
              Save, discard, or stay on this {schema.verbose_name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavigation(null)}>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleDiscardAndLeave} className="h-[var(--control-height)]">
              Discard &amp; leave
            </Button>
            <AlertDialogAction
              // Prevent the default auto-dismiss: the save is async and can
              // fail, in which case this dialog must stay closed-by-us only
              // after the attempt resolves, not the instant the button is
              // clicked — otherwise a failed save would flash the dialog
              // shut before the errors it's about to show even render.
              onClick={(event) => {
                event.preventDefault()
                void handleSaveAndLeave()
              }}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save & leave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

/**
 * Server errors go to the field that caused them when that field is on
 * screen. Anything else — record-level errors, or an error on a field the
 * user can't currently see (hidden by visible_when, or not in any group) —
 * goes to the banner, prefixed with the field's label, so no error is ever
 * swallowed.
 */
function mapValidationErrors(
  schema: ModelSchema,
  values: Record<string, unknown>,
  validation: Record<string, string[]>,
) {
  const onScreen = new Set(
    schema.groups
      .flatMap((group) => group.fields)
      .filter((name) => isVisible(schema.fields[name], values)),
  )
  const fieldErrors: Record<string, string> = {}
  const formErrors: string[] = []

  for (const [key, messages] of Object.entries(validation)) {
    const text = [messages].flat().join(' ')
    const field = schema.fields[key]
    if (field && onScreen.has(key)) {
      fieldErrors[key] = text
    } else {
      formErrors.push(field ? `${field.label}: ${text}` : text)
    }
  }
  return { fieldErrors, formErrors }
}

function FormBody({
  schema,
  values,
  labels,
  errors,
  dirtyFields,
  readOnly,
  locked,
  restricted,
  onChange,
  loading,
}: {
  schema: ModelSchema
  values: Record<string, unknown>
  labels: Record<string, string | null>
  errors: Record<string, string>
  dirtyFields?: Set<string>
  readOnly?: boolean
  /** Prefilled on a new record: shown, never editable here. */
  locked?: Set<string>
  /** Links whose target this user can't see. */
  restricted?: Record<string, boolean>
  onChange?: (name: string, value: unknown) => void
  loading?: boolean
}) {
  return (
    <div className="form-body">
      {schema.groups.map((group, index) => {
        // While loading there are no values to evaluate conditions against,
        // so every field shows; once loaded, visible_when decides.
        // The workflow state is drawn by the workflow bar (stepper and chip),
        // not repeated as a field.
        const visible = group.fields.filter(
          (name) => name !== schema.workflow?.field && (loading || isVisible(schema.fields[name], values)),
        )
        if (visible.length === 0) return null
        return (
          <section key={group.label ?? `group-${index}`} className="form-section">
            {group.label && <h2 className="form-section__label">{group.label}</h2>}
            <div className="form-section__fields">
              {visible.map((name) => (
                <div key={name} className="form-field" data-type={schema.fields[name].type}>
                  {renderFormField({
                    name,
                    schema: schema.fields[name],
                    value: values[name] ?? null,
                    displayValue: labels[name] ?? null,
                    restricted: restricted?.[name] === true,
                    onChange: (value) => onChange?.(name, value),
                    error: errors[name],
                    loading,
                    dirty: dirtyFields?.has(name),
                    readOnly: readOnly || locked?.has(name),
                  })}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function SchemaSkeleton() {
  return (
    <div className="form-sheet" aria-busy="true">
      <header className="form-header">
        <div className="form-header__text">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="mt-1.5 h-3 w-24" />
        </div>
      </header>
      <div className="form-body">
        <section className="form-section">
          <Skeleton className="mb-3 h-3 w-20" />
          <div className="form-section__fields">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-[var(--control-height)] w-full" />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * A record that doesn't exist and one this user may not see look the same, on
 * purpose: the API answers 404 for both. Nothing to retry; the way forward is
 * the list it would have been in, when that list is visible.
 */
function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A numbered document's own identifier ("BILL-2026-00012"), which says more than its id. */
function documentNumber(schema: ModelSchema, record: RecordEnvelope): string | null {
  const name = Object.keys(schema.fields).find((field) => schema.fields[field].assigned)
  const value = name ? record.values[name] : null
  return typeof value === 'string' && value ? value : null
}

/** What archiving does, said before it's done. Shared with the gallery. */
export function archiveConsequence(schema: Pick<ModelSchema, 'verbose_name' | 'verbose_name_plural'>) {
  return (
    `It leaves the ${schema.verbose_name_plural} list and stops appearing when someone picks a ` +
    `${schema.verbose_name}. Anything that already points at it keeps pointing at it, and it can be restored at any time.`
  )
}

/** The record's workflow state as a chip, in the tone the schema gives it. */
function StateChip({ schema, value }: { schema: ModelSchema; value: unknown }) {
  const state = schema.workflow?.states.find((s) => s.value === value)
  return state ? <StatusChip label={state.label} tone={state.tone} /> : null
}

function NotAvailable({ back }: { back: { to: string; plural: string } | null }) {
  return (
    <div className="form-sheet form-sheet--state">
      <StatePanel icon={FileQuestion} title="This record isn’t available" message="It doesn’t exist, or you don’t have access to it.">
        {back && (
          <Button asChild variant="outline" className="h-[var(--control-height)]">
            <Link to={back.to}>Back to {back.plural}</Link>
          </Button>
        )}
      </StatePanel>
    </div>
  )
}

/** 403 on create: the list is visible, adding to it isn't. */
function CannotCreate({ appLabel, model, schema }: { appLabel: string; model: string; schema: ModelSchema }) {
  return (
    <div className="form-sheet form-sheet--state">
      <StatePanel
        icon={LockKeyhole}
        title={`You can’t add ${schema.verbose_name_plural}`}
        message={`Your role lets you see ${schema.verbose_name_plural} but not add them. Someone who manages access can change that.`}
      >
        <Button asChild variant="outline" className="h-[var(--control-height)]">
          <Link to={listPath({ app_label: appLabel, model })}>Back to {schema.verbose_name_plural}</Link>
        </Button>
      </StatePanel>
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="form-sheet form-sheet--state">
      <StatePanel icon={CloudOff} tone="danger" title="Couldn’t load this record" message={message}>
        <Button variant="outline" onClick={onRetry} className="h-[var(--control-height)]">
          Try again
        </Button>
      </StatePanel>
    </div>
  )
}
