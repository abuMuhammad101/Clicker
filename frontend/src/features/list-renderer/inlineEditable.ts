import type { FieldSchema, FieldType } from '@/types/schema'

/**
 * The field types a table can edit in place: the ones that are one line of
 * text or one number. Anything with a picker, a date or a relation edits in
 * the record, where it has room. Decided by type, never by model.
 */
const INLINE_TYPES = new Set<FieldType>(['text', 'email', 'phone', 'url', 'integer', 'decimal'])

export function isInlineEditable(field: FieldSchema) {
  return INLINE_TYPES.has(field.type) && !field.read_only
}
