import { DecimalListCell } from '../decimal/DecimalListCell'

/** Right-aligned, tabular, thousands separators. */
export function IntegerListCell({ value }: { value: number | null }) {
  return <DecimalListCell value={value == null ? null : String(value)} decimalPlaces={0} />
}
