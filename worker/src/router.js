import { NotFoundError, MethodNotAllowedError } from './lib/http.js';

// Minimal method + path router. Deliberately not a framework: path params
// (:name), a trailing wildcard param (:name*, captures the rest of the
// path including slashes -- needed for R2 keys like branding/logo.png),
// method enforcement (a path match with the wrong method is a 405, not a
// 404), nothing else.
export function createRouter() {
  const routes = [];

  function add(method, path, handler) {
    const paramNames = [];
    const patternSource = path
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':') && segment.endsWith('*')) {
          paramNames.push(segment.slice(1, -1));
          return '(.+)';
        }
        if (segment.startsWith(':')) {
          paramNames.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    routes.push({ method, pattern: new RegExp(`^${patternSource}$`), paramNames, handler });
  }

  async function handle(ctx) {
    const path = ctx.url.pathname;
    let pathMatched = false;

    for (const route of routes) {
      const match = path.match(route.pattern);
      if (!match) continue;
      pathMatched = true;
      if (route.method !== ctx.request.method) continue;

      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      // Mutate the same ctx object rather than spreading it into a copy:
      // ctx.json's closure (middleware/requestId.js) captures the ctx
      // reference from the top of the middleware chain, and reads mutable
      // fields like ctx.extraCookies/ctx.session off it at call time. A
      // spread copy here would make route-handler mutations invisible to
      // that closure.
      ctx.params = params;
      return route.handler(ctx);
    }

    if (pathMatched) throw new MethodNotAllowedError();
    throw new NotFoundError('Route not found');
  }

  return {
    get: (path, handler) => add('GET', path, handler),
    post: (path, handler) => add('POST', path, handler),
    put: (path, handler) => add('PUT', path, handler),
    del: (path, handler) => add('DELETE', path, handler),
    handle,
  };
}
