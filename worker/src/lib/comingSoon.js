// Temporary pre-launch placeholder served on the custom production domain
// while SITE_LAUNCHED !== 'true' (see middleware/launchGate.js). Fully
// self-contained -- no fonts, scripts, or images fetched from anywhere --
// so it works even while the launch gate is blocking everything else.
export function comingSoonHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Aurora Creations</title>
<style>
  :root {
    --background: 30 33% 99%;
    --foreground: 0 0% 10%;
    --muted: 0 0% 38%;
    --border: 36 10% 87%;
    --gold: 39 48% 56%;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: 240 5% 4%;
      --foreground: 0 0% 90%;
      --muted: 0 0% 62%;
      --border: 240 4% 16%;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 1.5rem;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    text-align: center;
  }
  .wrap { max-width: 30rem; }
  .mark { width: 2.75rem; height: 2.75rem; margin: 0 auto 1.5rem; color: hsl(var(--gold)); }
  h1 {
    margin: 0 0 0.5rem;
    font-family: ui-serif, Georgia, "Times New Roman", serif;
    font-weight: 500;
    font-size: clamp(1.75rem, 5vw, 2.5rem);
    letter-spacing: 0.04em;
  }
  p.tagline {
    margin: 0 0 1.25rem;
    font-family: ui-serif, Georgia, "Times New Roman", serif;
    font-style: italic;
    font-size: clamp(1.05rem, 3vw, 1.25rem);
    color: hsl(var(--gold));
  }
  p.detail {
    margin: 0 0 2rem;
    font-size: 0.95rem;
    line-height: 1.6;
    color: hsl(var(--muted));
  }
  a.contact {
    display: inline-block;
    font-size: 0.9rem;
    letter-spacing: 0.02em;
    color: hsl(var(--foreground));
    text-decoration: none;
    border-top: 1px solid hsl(var(--border));
    padding-top: 1.25rem;
  }
  a.contact:hover { color: hsl(var(--gold)); }
</style>
</head>
<body>
  <div class="wrap">
    <svg class="mark" viewBox="0 0 48 48" fill="none" role="img" aria-label="Aurora Creations mark">
      <path d="M24 4 L38 18 L24 44 L10 18 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M10 18 L38 18" stroke="currentColor" stroke-width="1.5"/>
      <path d="M17 18 L24 4 L31 18" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M17 18 L24 44 L31 18" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
    <h1>Aurora Creations</h1>
    <p class="tagline">Something beautiful is coming soon.</p>
    <p class="detail">We&rsquo;re putting the finishing touches on our bespoke jewellery atelier. Thank you for your patience while we prepare to open our doors.</p>
    <a class="contact" href="mailto:enquiries@auroracreations.uk">enquiries@auroracreations.uk</a>
  </div>
</body>
</html>`;
}
