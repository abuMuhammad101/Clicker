import { cn } from "cn"

/**
 * A loading placeholder: a visible base with a highlight that sweeps across
 * it (see `.skeleton` in index.css). Still under reduced motion.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("skeleton rounded-md", className)} {...props} />
}

export { Skeleton }
