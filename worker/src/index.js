// Phase 2 minimal foundation.
//
// Only two concerns live here today: proving the deployed Worker can reach
// D1 and both R2 buckets, and giving /api/* somewhere to land so the
// run_worker_first routing in wrangler.jsonc has something real to hit.
// The actual Aurora API surface (products, orders, auth, ...) is built in
// Phase 3 against the src/api/backend adapter contract.
//
// The /api/_diag/* routes are diagnostic only -- self-cleaning R2
// round-trips used to verify the bindings work end to end during Phase 2
// validation. They carry no product/customer data and should be removed
// (or gated behind an admin check) before Phase 10 production readiness.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return handleHealth(env);
    }

    if (url.pathname === '/api/_diag/r2-roundtrip' && request.method === 'POST') {
      return handleR2Roundtrip(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found', path: url.pathname }, 404);
    }

    // Any non-/api/* request that reaches the Worker script at all means
    // run_worker_first didn't match it -- the asset/SPA layer should have
    // handled it already. Fail loudly rather than guessing.
    return json({ error: 'unexpected_worker_invocation', path: url.pathname }, 404);
  },
};

async function handleHealth(env) {
  let db = 'unknown';
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok').first();
    db = row?.ok === 1 ? 'ok' : 'unexpected_result';
  } catch (err) {
    db = `error: ${err.message}`;
  }

  return json({
    status: 'ok',
    db,
    timestamp: new Date().toISOString(),
  });
}

async function handleR2Roundtrip(request, env) {
  const url = new URL(request.url);
  const which = url.searchParams.get('bucket'); // 'public' | 'private'
  const bucket = which === 'private' ? env.UPLOADS_PRIVATE : which === 'public' ? env.MEDIA_PUBLIC : null;
  if (!bucket) {
    return json({ error: 'unknown_bucket', expected: ['public', 'private'] }, 400);
  }

  const key = `_diag/${crypto.randomUUID()}.txt`;
  const body = `aurora r2 roundtrip test ${new Date().toISOString()}`;

  try {
    await bucket.put(key, body);
    const got = await bucket.get(key);
    const text = got ? await got.text() : null;
    await bucket.delete(key);
    const afterDelete = await bucket.get(key);

    return json({
      bucket: which,
      key,
      wrote: true,
      readMatches: text === body,
      deleted: afterDelete === null,
    });
  } catch (err) {
    try {
      await bucket.delete(key);
    } catch {
      // best-effort cleanup only
    }
    return json({ bucket: which, error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
