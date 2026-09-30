import type { FieldSchema } from '@/types/schema'

/**
 * Whether a field applies to a record, given the record's values.
 *
 * Hidden means not applicable. A field whose `visible_when` is false keeps
 * its stored value (switching a contact from company to person and back
 * must not lose its tax ID), but that value is not part of the record as
 * it currently stands. Every consumer that reads field values — form,
 * list cells, and later exports and reports — asks this function first
 * rather than reading the stored value blindly.
 */
export function isVisible(field: FieldSchema, values: Record<string, unknown>): boolean {
  const condition = field.visible_when
  return !condition || values[condition.field] === condition.equals
}
