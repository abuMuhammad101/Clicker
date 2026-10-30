/** How tall a row is. The three values are the tokens in tokens.css. */
export type Density = 'compact' | 'default' | 'comfortable'

/** A person's choices for one list, kept per user on the server. */
export interface ListPrefs {
  density: Density
  /** Column ids hidden from the list's declared columns. */
  hidden: string[]
  /** Readable fields the person added beyond the declared columns. */
  extra?: string[]
}

export const DEFAULT_LIST_PREFS: ListPrefs = { density: 'default', hidden: [], extra: [] }

export const DENSITY_TOKEN: Record<Density, string> = {
  compact: '--row-height-compact',
  default: '--row-height',
  comfortable: '--row-height-comfortable',
}
