import './FigureNumber.css'

/**
 * A figure as a screen leads with it: the amount at full size, what qualifies it smaller. The currency ("Rs")
 * and a unit word ("lakh", "crore") are set small and quiet beside the number; paisa sit raised and small after
 * it, so "Rs 74,76,665.16" reads as seventy-four lakh first and sixteen paisa last. The text is unchanged
 * (copy it, read it aloud: the same string), only its parts are sized.
 */
export function FigureNumber({ text }: { text: string }) {
  const parts = /^([−-]?)([^\d−-]*?)\s?([\d,]+)(\.\d+)?(\s.+)?$/.exec(text)
  if (!parts) return <>{text}</>
  const [, sign, unit, whole, fraction, suffix] = parts
  // A compact total ("Rs 4.2 lakh") keeps its decimal at full size: there it is part of the number.
  const smallFraction = fraction && !suffix
  return (
    <span className="figure-number">
      {sign}
      {unit && <span className="figure-number__unit">{unit} </span>}
      {whole}
      {fraction && (smallFraction ? <span className="figure-number__fraction">{fraction}</span> : fraction)}
      {suffix && <span className="figure-number__unit figure-number__unit--after">{suffix}</span>}
    </span>
  )
}
