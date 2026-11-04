/**
 * Mirrors backend/data/serializers.py's serialize_record(). `values` uses
 * exactly the schema's field names; a many_to_one value is its bare id, and
 * its human label lives in `labels` so the value's shape is the same on
 * read and on write.
 */
/** One figure about a record; `value` is a decimal string, or null when there is nothing to show. */
export interface RecordSummary {
  key: string
  label: string
  aggregate: string
  type: 'currency' | 'integer' | 'decimal'
  value: string | null
}

export interface RecordEnvelope {
  id: number
  display: string
  values: Record<string, unknown>
  labels: Record<string, string | null>
  /** Links whose target this user can't see: the id stays, the label is withheld. */
  restricted?: Record<string, boolean>
  /** Server-owned audit facts (ISO date-times, people). */
  meta?: {
    created_at: string
    updated_at: string
    created_by: RecordPerson | null
    updated_by: RecordPerson | null
  }
  /** The record's own figures (Schema.record_summaries) this user can read. */
  summaries?: RecordSummary[]
  /** Present when the model has a workflow: what this user can do to this record now. */
  workflow?: RecordWorkflow
}

export interface RecordWorkflow {
  /** Transitions this user may run now (granted, right state, not barred). */
  available: string[]
  locked: boolean
  /** Why it can't be edited, in words; null when it can. */
  locked_reason: string | null
  /** When this user can do nothing: who can, and what. Null otherwise. */
  waiting: string | null
  /** Why a transition this user holds isn't offered right now (its own check refuses), in words. */
  held_back?: string[]
  /** For a transition whose question depends on the record: the sentence to confirm with. */
  confirms?: Record<string, string>
}

export interface RecordPerson {
  id: number
  display_name: string
}
