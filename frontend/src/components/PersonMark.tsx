import './PersonMark.css'

/** "Farhan Raza" → "FR"; "Ayesha" → "A". Letters only, and nothing in brackets ("(demo)") is part of a name. */
export function initials(name: string): string {
  const words = name.replace(/\([^)]*\)/g, ' ').match(/\p{L}[\p{L}'’.-]*/gu) ?? []
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/**
 * A person, recognised before they are read: their initials in a small neutral disc, then their name. Neutral
 * on purpose: colour in this system means state, and a person is not a state. Decorative to a screen reader,
 * which reads the name beside it.
 */
export function PersonMark({ name }: { name: string }) {
  const letters = initials(name)
  if (!letters) return null
  return (
    <span className="person-mark" aria-hidden>
      {letters}
    </span>
  )
}
