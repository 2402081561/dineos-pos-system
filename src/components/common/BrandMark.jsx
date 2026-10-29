// Shared system mark. Shop names and receipt logos remain independently configurable.
function BrandMark({ className = 'h-8 w-8', decorative = false }) {
  return (
    <img
      alt={decorative ? '' : 'DineOS'}
      aria-hidden={decorative ? true : undefined}
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
      height="192"
      src="/branding/dineos-mark.png"
      width="192"
    />
  )
}

export default BrandMark
