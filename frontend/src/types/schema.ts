/**
 * Mirrors backend/schema/engine.py's output. The field type registry is
 * fixed by CLAUDE.md — the full union is declared here even though not
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
  read_only: boolean
  visible_when: VisibleWhen | null
  max_length?: number
  default?: unknown
  choices?: Choice[]
  target?: FieldTarget
  domain?: Record<string, unknown>
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
}

export interface ModelSchema {
  model: string
  app_label: string
  verbose_name: string
  verbose_name_plural: string
  display_field: string | null
  list: ListSchema
  fields: Record<string, FieldSchema>
}
