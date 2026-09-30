import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { renderFormField } from '@/fields/registry'
import { apiGet, apiSend, ApiError } from '@/lib/api'
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

  useEffect(() => {
    document.title = record ? `${record.display} · Clicker` : `New ${schema.verbose_name} · Clicker`
  }, [record, schema.verbose_name])

  const setValue = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }))
    setLabels((current) => (current[name] == null ? current : { ...current, [name]: null }))
    setJustSaved(false)
  }

  const save = async () => {
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
      setValues(saved.values)
      setLabels(saved.labels)
      setJustSaved(true)
      onSaved?.(saved)
    } catch (error) {
      if (error instanceof ApiError && error.validation) {
        const mapped = mapValidationErrors(schema, values, error.validation)
        setFieldErrors(mapped.fieldErrors)
        setFormErrors(mapped.formErrors)
      } else {
        const message = error instanceof ApiError ? error.message : 'Could not reach the API.'
        setFormErrors([`Not saved: ${message}`])
      }
    } finally {
      setSaving(false)
    }
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
            <a className="form-header__model" href={`/${appLabel}/${model}`}>
              {schema.verbose_name_plural}
            </a>
            {record && <span className="form-header__id">#{record.id}</span>}
          </p>
        </div>
        <div className="form-header__actions">
          {justSaved && <span className="form-header__status">Saved</span>}
          <Button type="submit" disabled={saving} className="h-[var(--control-height)]">
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
        onChange={setValue}
      />
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
  onChange,
  loading,
}: {
  schema: ModelSchema
  values: Record<string, unknown>
  labels: Record<string, string | null>
  errors: Record<string, string>
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
