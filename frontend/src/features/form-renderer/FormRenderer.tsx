import { useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { renderFormField } from '@/fields/registry'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import { Link } from '@/lib/Link'
import { navigate, useNavigationBlocker } from '@/lib/router'
import { useCurrentPageLabel } from '@/shell/pageLabel'
import { useModelSchema } from '@/lib/useModelSchema'
import { isVisible } from '@/lib/visibility'
import type { RecordEnvelope } from '@/types/record'
import type { ModelSchema } from '@/types/schema'
import './FormRenderer.css'

/**
 * Renders any exposed model's form from its schema. Nothing in this folder
 * may know which model it is showing — if a form needs model-specific
 * behaviour, that behaviour belongs in the model's `Schema` class and the
 * schema engine, and this file only learns the new generic capability.
 */
interface FormRendererProps {
  appLabel: string
  model: string
  /** Omit to create a new record. */
  recordId?: number
  onSaved?: (record: RecordEnvelope) => void
}

export function FormRenderer(props: FormRendererProps) {
  // Retry = remount. Schema and record fetches both restart from scratch,
  // with no stale partial state carried over from the failed attempt.
  const [attempt, setAttempt] = useState(0)
  return (
    <div className="form-page">
      <FormSheet key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
    </div>
  )
}

type RecordState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; record: RecordEnvelope | null }

function FormSheet({
  appLabel,
  model,
  recordId,
  onSaved,
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
        setRecordState({ status: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [appLabel, model, recordId])

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
      schema={schemaState.schema}
      record={recordState.record}
      appLabel={appLabel}
      model={model}
      onSaved={onSaved}
    />
  )
}

function initialValues(schema: ModelSchema, record: RecordEnvelope | null) {
  if (record) return record.values
  // A new record starts from the schema's defaults. A boolean with no
  // default is false — a checkbox has no "empty".
  return Object.fromEntries(
    Object.entries(schema.fields).map(([name, field]) => [
      name,
      field.default ?? (field.type === 'boolean' ? false : null),
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
  onSaved,
}: {
  schema: ModelSchema
  record: RecordEnvelope | null
  appLabel: string
  model: string
  onSaved?: (record: RecordEnvelope) => void
}) {
  const [record, setRecord] = useState(initialRecord)
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialValues(schema, initialRecord),
  )
  // What the form would revert to: the loaded record's values, or a new
  // record's schema defaults. Reset to the server's response on every
  // successful save, which is what makes the form clean again afterward.
  const [baseline, setBaseline] = useState<Record<string, unknown>>(() =>
    initialValues(schema, initialRecord),
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

  const dirtyFields = dirtyFieldNames(schema, values, baseline)
  const isDirty = dirtyFields.size > 0

  const pageLabel = record ? record.display : `New ${schema.verbose_name}`
  useEffect(() => {
    document.title = `${pageLabel} · Clicker`
  }, [pageLabel])
  // The shell's breadcrumb ends with what this form is showing.
  useCurrentPageLabel(pageLabel)

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

  const modelHref = `/${appLabel}/${model}`

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
      className="form-sheet"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      noValidate
    >
      <header className="form-header">
        <div className="form-header__text">
          <h1 className="form-header__title" title={record?.display}>
            {record ? record.display : `New ${schema.verbose_name}`}
          </h1>
          <p className="form-header__meta">
            <Link className="form-header__model" to={modelHref}>
              {schema.verbose_name_plural}
            </Link>
            {record && <span className="form-header__id">#{record.id}</span>}
          </p>
        </div>
        <div className="form-header__actions">
          {justSaved && <span className="form-header__status">Saved</span>}
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
        </div>
      </header>

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
        onChange={setValue}
      />

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
              You have unsaved changes to this {schema.verbose_name}. Save them, discard them, or stay
              on this page.
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
  onChange,
  loading,
}: {
  schema: ModelSchema
  values: Record<string, unknown>
  labels: Record<string, string | null>
  errors: Record<string, string>
  dirtyFields?: Set<string>
  onChange?: (name: string, value: unknown) => void
  loading?: boolean
}) {
  return (
    <div className="form-body">
      {schema.groups.map((group, index) => {
        // While loading there are no values to evaluate conditions against,
        // so every field shows; once loaded, visible_when decides.
        const visible = group.fields.filter(
          (name) => loading || isVisible(schema.fields[name], values),
        )
        if (visible.length === 0) return null
        return (
          <section key={group.label ?? `group-${index}`} className="form-section">
            {group.label && <h2 className="form-section__label">{group.label}</h2>}
            <div className="form-section__fields">
              {visible.map((name) => (
                <div key={name}>
                  {renderFormField({
                    name,
                    schema: schema.fields[name],
                    value: values[name] ?? null,
                    displayValue: labels[name] ?? null,
                    onChange: (value) => onChange?.(name, value),
                    error: errors[name],
                    loading,
                    dirty: dirtyFields?.has(name),
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

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="form-sheet form-sheet--error" role="alert">
      <h1 className="form-error__title">Couldn’t load this record</h1>
      <p className="form-error__message">{message}</p>
      <Button variant="outline" onClick={onRetry} className="h-[var(--control-height)]">
        Try again
      </Button>
    </div>
  )
}
