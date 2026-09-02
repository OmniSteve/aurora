import * as React from "react"
import { cn } from "@/lib/utils"

// A generic placeholder shown when `src` is empty, or after a real image
// URL fails to load — not tied to any particular image host.
const FALLBACK_IMAGE_URL =
  "https://static.wixstatic.com/media/12d367_4f26ccd17f8f4e3a8958306ea08c2332~mv2.png"

/**
 * Plain <img> wrapper: falls back to a placeholder when `src` is empty or
 * fails to load. No per-host resize/crop/format transforms — R2-hosted
 * images are served as-is.
 */
const Image = React.forwardRef(({ src, className, onError, ...props }, ref) => {
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    setFailed(false)
  }, [src])

  const handleError = (event) => {
    if (!failed) setFailed(true)
    onError?.(event)
  }

  const resolvedSrc = !src || failed ? FALLBACK_IMAGE_URL : src

  return (
    <img
      ref={ref}
      src={resolvedSrc}
      className={cn(className)}
      onError={handleError}
      data-empty-image={!src || undefined}
      data-error-image={failed || undefined}
      {...props}
    />
  )
})
Image.displayName = "Image"

export { Image }
