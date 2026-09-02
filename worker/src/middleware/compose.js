// (next) => async (ctx) => Response, applied outermost-first:
// compose(a, b, c)(handler) === a(b(c(handler)))
export function compose(...middlewares) {
  return (finalHandler) => middlewares.reduceRight((next, mw) => mw(next), finalHandler);
}
