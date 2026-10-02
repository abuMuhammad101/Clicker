import { Box } from 'lucide-react'
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic'

const KNOWN = new Set<string>(iconNames)

/**
 * A model's icon, by the lucide name its Schema declares. Each icon is its
 * own lazily loaded chunk, so declaring one costs nothing until it's shown —
 * and the app never has a hand-kept map from model to icon.
 *
 * No name, or a name lucide doesn't have, is the generic icon: icon design
 * is deferred, and never blocks a module from appearing.
 */
export function ModelIcon({ name, className }: { name?: string | null; className?: string }) {
  const generic = <Box className={className} aria-hidden />
  if (!name || !KNOWN.has(name)) return generic
  return (
    <DynamicIcon
      name={name as IconName}
      className={className}
      aria-hidden
      fallback={() => <span className={className} />}
    />
  )
}
