// Static branding assets, served by the Worker's own /media/* route
// (worker/src/routes/media.js) from the aurora-media-dev R2 bucket --
// re-hosted from Base44 in Phase 5 (see migration/MEDIA.md). Relative
// paths: same-origin deployment, works in every environment without a
// hardcoded domain. No production media custom domain is configured yet
// (see migration/plan.html decision D) -- this Worker-served path is the
// deliberate development stand-in for one.
export const BRAND = {
  logo: '/media/branding/aurora-logo.png',
  heroImage: '/media/branding/hero-image.png',
  bespokeImage: '/media/branding/bespoke-image.png',
};