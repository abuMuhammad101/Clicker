/** How tall a row is. The three values are the tokens in tokens.css. */
export type Density = 'compact' | 'default' | 'comfortable'

/** A person's choices for one list, kept per user on the server. */
export interface ListPrefs {
  density: Density
  /** Column ids hidden from the list's declared columns. */
  hidden: string[]
}

export const DEFAULT_LIST_PREFS: ListPrefs = { density: 'default', hidden: [] }

export const DENSITY_TOKEN: Record<Density, string> = {
  compact: '--row-height-compact',
  default: '--row-height',
  comfortable: '--row-height-comfortable',
}
