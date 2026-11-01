import { createContext } from 'react'

/**
 * The write-once rule for the field being rendered ("Set when the record is
 * created. Ask a Manager to change it."), or null. Provided by the field
 * registry from the schema and read by FieldShell, so every field type shows
 * the same mark without each component passing it along.
 */
export const WriteOnceNoteContext = createContext<string | null>(null)

/**
 * What an empty server-assigned field says instead of "—" ("Assigned when
 * saved"), or null. A new bill's number is not missing; it's on its way.
 */
export const AssignedNoteContext = createContext<string | null>(null)
