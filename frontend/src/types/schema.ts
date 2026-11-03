/**
 * Mirrors backend/schema/engine.py's output. The field type registry is
 * fixed by CLAUDE.md â€” the full union is declared here even though not
 * every type appears in a model's schema yet.
 */

export type FieldType =
  | 'text'
  | 'longtext'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'selection'
  | 'many_to_one'
  | 'one_to_many'
  | 'many_to_many'
  | 'email'
  | 'phone'
  | 'url'
  | 'currency'
  | 'binary'

export interface Choice {
  value: string
  label: string
}

export interface VisibleWhen {
  field: string
  equals: string | number | boolean
}

export interface FieldTarget {
  app_label: string
  model: string
}

export interface FieldSchema {
  type: FieldType
  label: string
  required: boolean
  /** Not writable by this user when editing an existing record. */
  read_only: boolean
  /** Not writable by this user when creating a record. */
  read_only_on_create?: boolean
  visible_when: VisibleWhen | null
  max_length?: number
  max_digits?: number
  decimal_places?: number
  default?: unknown
  choices?: Choice[]
  target?: FieldTarget
  domain?: Record<string, unknown>
  help_text?: string
  /** From the model's validators: a number (integer), a decimal string, or an ISO date. */
  min_value?: number | string
  max_value?: number | string
  /** Currency fields: the organisation currency's code ("PKR"). */
  currency?: string
  /** Present on computed fields: what it's calculated from, for the "calculated" mark. */
  computed?: { from: string[]; description: string }
  /**
   * Present when this user may set the field only while creating a record
   * (read-only afterwards). `note` is the rule in words, shown in both forms.
   */
  write_once?: { note: string }
  /** Server-assigned on create (a document number): what an empty one says instead. */
  assigned?: string
  /** Computed fields a list can group into ranges ("0–30 days"), inclusive at both ends. */
  buckets?: { label: string; min?: number; max?: number }[]
}

/** A reverse relation shown under a record's form (Schema.related_lists). */
export interface RelatedListSchema {
  name: string
  label: string
  target: FieldTarget
  /** The field on the target that points back at this record. */
  field: string
  columns: string[]
  can_add: boolean
}

export interface FieldGroup {
  /**
   * null means "the model declared no groups at all" (e.g. Country) â€” render
   * the fields with no section heading. A literal "Ungrouped" label means
   * groups were declared but these fields weren't assigned to one; render it
   * visibly, since that's a module author's oversight, not a design choice.
   */
  label: string | null
  fields: string[]
}

export interface ListSort {
  field: string
  direction: 'asc' | 'desc'
}

export interface ListSchema {
  columns: string[]
  sort: ListSort[]
  default_filters: Record<string, unknown>
  search_fields: string[]
  /** Fields this user can group the list by. */
  groupable?: string[]
  /** The model's summaries this user may see (values come from the aggregate endpoint). */
  summaries?: { key: string; label: string; aggregate: 'sum' | 'count' | 'avg' }[]
}

/** What this user may do with the model, from the same check the API enforces. */
export interface SchemaActions {
  view: boolean
  create: boolean
  update: boolean
  /** Archive and restore: an edit of `archive_field`, allowed when the user may write it. */
  archive: boolean
  delete: boolean
}

export type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral'

export interface WorkflowState {
  value: string
  label: string
  tone: Tone
  /** Only on exits (states off the path): the path step it leaves from. */
  after?: string | null
}

/** A transition this user holds the grant for. Ones they lack are never sent. */
export interface WorkflowTransition {
  name: string
  label: string
  from: string[]
  to: string
  /** Ask before running it; the text is the consequence. */
  confirm?: string
  /** What it does, shown beside its button before anyone presses it. */
  hint?: string
}

/** Schema.workflow: the states and the transitions this user may run. */
export interface WorkflowSchema {
  /** The state field's name. */
  field: string
  states: WorkflowState[]
  /** The main line of states, in order; others are exits (Cancelled, Rejected). */
  path: string[]
  /** States in which the record can't be edited. */
  locked: string[]
  transitions: WorkflowTransition[]
}

export interface ModelSchema {
  model: string
  app_label: string
  verbose_name: string
  verbose_name_plural: string
  display_field: string | null
  groups: FieldGroup[]
  list: ListSchema
  fields: Record<string, FieldSchema>
  related_lists?: RelatedListSchema[]
  /** Null when the model has no workflow. */
  workflow?: WorkflowSchema | null
  /** A boolean field where false means archived; null when the model can't be archived. */
  archive_field?: string | null
  actions: SchemaActions
}
