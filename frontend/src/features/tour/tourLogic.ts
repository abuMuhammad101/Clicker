/**
 * The tour's pure parts: its types, how progress is kept, how a step's text reads real numbers off the page, and
 * which anchor a step means. No React here, so every rule is a plain function that can be tested.
 */
export interface TourStep {
  id: string
  /** Where the step happens. The engine navigates there if the person is elsewhere. */
  route?: string
  /** Open the first record matching a list query instead of naming one: { model: 'app.model', filter?, q? }. */
  open_record?: { model: string; filter?: string; q?: string }
  /** A `data-tour` anchor the generic renderers emit. */
  target: string
  /** When several anchors share a name, the one whose text contains this. */
  match?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end'
  /** The step is skipped silently when its anchor never appears (a state the live data is not in). */
  optional?: boolean
  /** The step moves on by itself when the person does the thing. */
  until?: { type: 'click'; target?: string } | { type: 'route'; value: string } | { type: 'present'; target: string; match?: string }
}

export interface Tour {
  id: string
  title: string
  steps: TourStep[]
  ending: string
}

/** What is remembered per person (UserPreference "tour.progress"). */
export type TourProgress =
  | { tour: string; status: 'paused'; index: number }
  | { tour: string; status: 'done' }
  | { tour: string; status: 'skipped' }

/** Is there something to pick up? A pause is; a finished or skipped tour is not (it can still be restarted). */
export function resumable(progress: TourProgress | null, tourId: string): progress is Extract<TourProgress, { status: 'paused' }> {
  return !!progress && progress.tour === tourId && progress.status === 'paused'
}

/** The tour may start by itself only if the person never met it and the automation switch is not set. */
export function mayAutoStart(progress: TourProgress | null, tourId: string, disabled: boolean): boolean {
  if (disabled) return false
  return !progress || progress.tour !== tourId
}

/** "3 of 8". */
export function progressLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`
}

/** The next step index in `direction` that is not in `skipped`, or null past either end. */
export function nextIndex(from: number, total: number, direction: 1 | -1, skipped: ReadonlySet<number>): number | null {
  for (let i = from + direction; i >= 0 && i < total; i += direction) if (!skipped.has(i)) return i
  return null
}

const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim()

/** The anchors on the page for a step, in document order, narrowed by `match`, and only those that take up room. */
export function findAnchors(step: Pick<TourStep, 'target' | 'match'>, root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)].filter((element) => {
    if (step.match && !text(element).includes(step.match)) return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

/**
 * Numbers in a step's words come from the page, never from the manifest:
 *   {{summary:Open jobs}}  the value of the summary-strip card with that label
 *   {{group:Over 180 days}} "386 records worth Rs 177 crore" for the group with that label
 * A reference that cannot be read leaves the step without that clause rather than with a wrong number.
 */
export function fillNumbers(body: string, root: ParentNode = document): string {
  return body
    .replace(/\{\{summary:([^}]+)\}\}/g, (_, label: string) => {
      for (const item of root.querySelectorAll('.summary-strip__item')) {
        if (text(item.querySelector('.summary-strip__label')) === label.trim()) return text(item.querySelector('.summary-strip__value')) || '—'
      }
      return '—'
    })
    .replace(/\{\{group:([^}]+)\}\}/g, (_, label: string) => {
      for (const group of root.querySelectorAll('[data-tour="group-header"]')) {
        if (text(group.querySelector('.list-group__label')) !== label.trim()) continue
        const count = text(group.querySelector('.list-group__count'))
        const sum = text(group.querySelector('.list-group__sum'))
        return sum ? `${count} records worth ${sum}` : `${count} records`
      }
      return '—'
    })
}

export type Placement = NonNullable<TourStep['placement']>

/** Where the step's card goes: the wanted side if it fits, the opposite side if not, always inside the window. */
export function place(
  anchor: { left: number; top: number; width: number; height: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  wanted: Placement = 'bottom',
  gap = 12,
  margin = 12,
): { left: number; top: number; side: Placement } {
  const fits = (side: Placement) => {
    if (side === 'bottom' || side === 'bottom-end') return anchor.top + anchor.height + gap + card.height <= viewport.height - margin
    if (side === 'top') return anchor.top - gap - card.height >= margin
    if (side === 'right') return anchor.left + anchor.width + gap + card.width <= viewport.width - margin
    return anchor.left - gap - card.width >= margin
  }
  const opposite: Record<Placement, Placement> = { bottom: 'top', 'bottom-end': 'top', top: 'bottom', right: 'left', left: 'right' }
  const order: Placement[] = [wanted, opposite[wanted], 'bottom', 'top', 'right', 'left']
  const side = order.find(fits) ?? wanted
  let left = anchor.left
  let top = anchor.top + anchor.height + gap
  if (side === 'bottom-end') left = anchor.left + anchor.width - card.width
  if (side === 'top') top = anchor.top - gap - card.height
  if (side === 'right' || side === 'left') {
    top = anchor.top + anchor.height / 2 - card.height / 2
    left = side === 'right' ? anchor.left + anchor.width + gap : anchor.left - gap - card.width
  }
  left = Math.min(Math.max(left, margin), Math.max(margin, viewport.width - card.width - margin))
  top = Math.min(Math.max(top, margin), Math.max(margin, viewport.height - card.height - margin))
  return { left, top, side }
}
