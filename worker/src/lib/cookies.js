// Minimal cookie read/write helpers. No library -- the parsing and
// Set-Cookie construction needed here is small and the attribute list
// (Secure/HttpOnly/SameSite/Path/Max-Age) is security-relevant enough that
// it's worth having it inline and readable rather than behind a dependency.

export function getCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

// name=value; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=<seconds>
// No `Domain` attribute -- host-only cookies are the right default here and
// avoid the "wildcard across subdomains" footgun; add one only if a
// specific cross-subdomain requirement shows up later.
export function buildCookie(name, value, { maxAgeSeconds, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Secure', 'SameSite=Lax', 'Path=/'];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

export function buildExpiredCookie(name, { httpOnly = true } = {}) {
  const parts = [`${name}=`, 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (httpOnly) parts.push('HttpOnly');
  return parts.join('; ');
}
