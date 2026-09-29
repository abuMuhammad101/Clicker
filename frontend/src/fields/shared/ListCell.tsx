import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './ListCell.css'

interface ListCellProps {
  children?: ReactNode
  empty?: boolean
  title?: string
  className?: string
}

/**
 * Shared read-only cell chrome: min/max column width, ellipsis truncation
 * for anything long, and the "—" convention for absent values used
 * everywhere else in Clicker (matches the schema-viewer table).
 */
export function ListCell({ children, empty, title, className }: ListCellProps) {
  return (
    <div className={cn('list-cell', empty && 'list-cell--empty', className)} title={title}>
      {empty ? '—' : children}
    </div>
  )
}
