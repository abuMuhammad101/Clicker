/**
 * Reads a px token from tokens.css at runtime, for the few places a number
 * has to live in JS rather than CSS — the virtualiser needs row height as a
 * number, TanStack needs column widths as numbers. tokens.css stays the only
 * source of truth; the fallback only covers a stylesheet that failed to load.
 */
export function tokenPx(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  const value = parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}
