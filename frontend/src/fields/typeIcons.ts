import {
  AlignLeft,
  ArrowUpRight,
  Calendar,
  CircleCheck,
  CircleDot,
  Globe,
  Hash,
  Link2,
  List,
  Mail,
  Paperclip,
  Phone,
  Type,
  type LucideIcon,
} from 'lucide-react'

/**
 * One small glyph per registry field type, used in column headers so a table
 * says what kind of thing each column holds before you read it. Keyed by
 * type, never by model or field: a new module's columns get theirs free.
 */
const ICONS: Record<string, LucideIcon> = {
  text: Type,
  longtext: AlignLeft,
  integer: Hash,
  decimal: Hash,
  currency: Hash,
  boolean: CircleCheck,
  date: Calendar,
  datetime: Calendar,
  selection: CircleDot,
  many_to_one: ArrowUpRight,
  one_to_many: List,
  many_to_many: List,
  email: Mail,
  phone: Phone,
  url: Globe,
  binary: Paperclip,
}

export function typeIcon(type: string): LucideIcon {
  return ICONS[type] ?? Link2
}
