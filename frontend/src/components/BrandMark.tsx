import './BrandMark.css'

/**
 * A placeholder mark for the design authority to replace: an accent tile and
 * an open ring, the "c". Drawn in tokens so it follows the theme.
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="6" className="brand-mark__tile" />
      <path
        d="M13.4 7.1a4.3 4.3 0 1 0 0 5.8"
        fill="none"
        strokeWidth="1.9"
        strokeLinecap="round"
        className="brand-mark__ring"
      />
    </svg>
  )
}
