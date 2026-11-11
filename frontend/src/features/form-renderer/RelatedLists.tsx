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

/**
 * One related list. Stacked under a record it carries its own title; in a tab (`bare`) the tab is the title,
 * so only the way to add one and the way to see them all remain, and it shows more rows.
 */
export function RelatedList({
  parent,
  list,
  bare = false,
  rows = RELATED_ROWS,
  onTotal,
}: {
  parent: ModelRef & { id: number }
  list: RelatedListSchema
  bare?: boolean
  rows?: number
  onTotal?: (total: number) => void
}) {
  const [total, setTotal] = useState<number | null>(null)
  const filter = { [list.field]: parent.id }
  const viewAll = `${listPath(list.target)}?${new URLSearchParams({ [list.field]: String(parent.id) }).toString()}`

  const add = list.can_add && (
    <Button
      type="button"
      // Quiet until wanted: one per list, so a statement with six lists does not carry six boxed buttons.
      variant="ghost"
      className="h-[var(--control-height-sm)] gap-[var(--space-2)] px-[var(--control-padding-x)] text-[length:var(--text-sm)] text-[color:var(--text-secondary)]"
      // A new related record opens in a peek, its link to this record
      // already set and locked.
      onClick={() => openRecord(list.target, 'new', { surface: 'peek', prefill: { [list.field]: String(parent.id) } })}
    >
      <Plus className="size-3.5" aria-hidden />
      Add
    </Button>
  )

  return (
    <section className={bare ? 'related-list related-list--bare' : 'related-list'} aria-label={list.label}>
      {bare ? (
        add && <div className="related-list__tools">{add}</div>
      ) : (
        <header className="related-list__head">
          <h2 className="related-list__title">
            {list.label}
            {/* Zero is said once, by the line under the title ("No adjustments yet"). */}
            {total != null && total > 0 && <span className="related-list__count">{total.toLocaleString()}</span>}
          </h2>
          {add}
        </header>
      )}
      <ListRenderer
        appLabel={list.target.app_label}
        model={list.target.model}
        filter={filter}
        columns={list.columns}
        variant="embedded"
        maxRows={rows}
        onTotal={(next) => {
          setTotal(next)
          onTotal?.(next)
        }}
      />
      {total != null && total > rows && (
        <Link to={viewAll} className="related-list__all">
          View all {total.toLocaleString()}
        </Link>
      )}
    </section>
  )
}
