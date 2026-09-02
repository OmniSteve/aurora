// Groundwork only -- not wired to any HTTP route in Phase 3.
//
// Per the Phase 3 media boundary: admin catalogue uploads need admin auth
// (Phase 4), customer bespoke/special-request uploads need a restricted,
// rate-limited, MIME/size-validated flow, and private R2 objects must never
// get a public URL. None of that security context exists yet, so this stays
// an unused abstraction over the R2 bindings until a route can be built on
// top of it safely.
export function createMediaRepository(bucket) {
  return {
    put: (key, body, options) => bucket.put(key, body, options),
    get: (key) => bucket.get(key),
    delete: (key) => bucket.delete(key),
  };
}

// Key scheme from migration/MEDIA.md.
export function buildProductImageKey(productId, index, ext) {
  return `products/${productId}/${index}.${ext}`;
}

export function buildBespokeImageKey(bespokeRequestId, index, ext) {
  return `bespoke/${bespokeRequestId}/${index}.${ext}`;
}

export function buildBrandingKey(name) {
  return `branding/${name}`;
}
