/**
 * Mirrors backend/data/serializers.py's serialize_record(). `values` uses
 * exactly the schema's field names; a many_to_one value is its bare id, and
 * its human label lives in `labels` so the value's shape is the same on
 * read and on write.
 */
export interface RecordEnvelope {
  id: number
  display: string
  values: Record<string, unknown>
  labels: Record<string, string | null>
}
