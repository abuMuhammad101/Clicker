/**
 * Every registry field type implements this same contract for its FORM
 * component and a matching one for its LIST CELL. States are derived from
 * real props (value/required/error/etc.), not an artificial "state" enum —
 * a form renderer will drive these with real data, so the components need
 * to behave correctly under real combinations, not a fixed set of demo
 * modes. `forceFocused` is the one gallery-only exception: only one real
 * element can hold DOM focus at a time, so the gallery needs a way to show
 * every component's focused look side by side.
 */
export interface FieldProps<T> {
  name: string
  label: string
  value: T | null
  onChange?: (value: T | null) => void
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  loading?: boolean
  error?: string
  helpText?: string
  placeholder?: string
  /** Gallery-only. Never set by the real form renderer. */
  forceFocused?: boolean
}

export interface ListCellProps<T> {
  value: T | null
}

/**
 * Gallery-only: reproduces shadcn's own focus-visible ring as plain,
 * always-on classes, since real DOM focus can only apply to one element at
 * a time and the gallery needs to show every component's focused look
 * simultaneously, side by side. `force-focused` hooks into the same halo
 * rule as real :focus-visible in fields.css, so the two can't drift apart.
 */
export const FORCE_FOCUS_CLASSES = 'border-ring ring-3 force-focused'

