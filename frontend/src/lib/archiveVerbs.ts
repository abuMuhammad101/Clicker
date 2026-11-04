import type { ModelSchema } from '@/types/schema'

/** What archiving is called here: the schema's words, or the generic ones. */
export function archiveVerbs(schema: Pick<ModelSchema, 'archive_verbs'>) {
  const declared = schema.archive_verbs ?? {}
  return {
    archive: declared.archive ?? 'Archive',
    restore: declared.restore ?? 'Restore',
    archived: declared.archived ?? 'Archived',
    restored: declared.restored ?? 'Restored',
    consequence: declared.consequence,
    notice: declared.notice,
  }
}
