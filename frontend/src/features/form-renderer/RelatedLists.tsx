import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ListRenderer } from '@/features/list-renderer/ListRenderer'
import { Link } from '@/lib/Link'
import { listPath, openRecord, type ModelRef } from '@/records'
import type { RelatedListSchema } from '@/types/schema'

/** How many related records show under a form before "View all". */
const RELATED_ROWS = 10

/**
 * The reverse relations a model's schema asks to show under a record (a
 * company's People, its Products supplied). Each is the ordinary list
 * renderer, embedded and filtered to this record; nothing here knows any
 * model. The schema already left out lists this user can't see, and says
 * whether they may add to each.
 */
export function RelatedLists({ parent, lists }: { parent: ModelRef & { id: number }; lists: RelatedListSchema[] }) {
  if (lists.length === 0) return null
  return (
    <div className="related-lists">
      {lists.map((list) => (
        <RelatedList key={list.name} parent={parent} list={list} />
      ))}
    </div>
  )
}

function RelatedList({ parent, list }: { parent: ModelRef & { id: number }; list: RelatedListSchema }) {
  const [total, setTotal] = useState<number | null>(null)
  const filter = { [list.field]: parent.id }
  const viewAll = `${listPath(list.target)}?${new URLSearchParams({ [list.field]: String(parent.id) }).toString()}`

  return (
    <section className="related-list" aria-label={list.label} data-tour="related-list">
      <header className="related-list__head">
        <h2 className="related-list__title">
          {list.label}
          {total != null && <span className="related-list__count">{total.toLocaleString()}</span>}
        </h2>
        {list.can_add && (
          <Button
            type="button"
            variant="outline"
            className="h-[var(--control-height-sm)] gap-[var(--space-2)] px-[var(--control-padding-x)] text-[length:var(--text-sm)]"
            // A new related record opens in a peek, its link to this record
            // already set and locked.
            onClick={() =>
              openRecord(list.target, 'new', { surface: 'peek', prefill: { [list.field]: String(parent.id) } })
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Add
          </Button>
        )}
      </header>
      <ListRenderer
        appLabel={list.target.app_label}
        model={list.target.model}
        filter={filter}
        columns={list.columns}
        variant="embedded"
        maxRows={RELATED_ROWS}
        onTotal={setTotal}
      />
      {total != null && total > RELATED_ROWS && (
        <Link to={viewAll} className="related-list__all">
          View all {total.toLocaleString()}
        </Link>
      )}
    </section>
  )
}
