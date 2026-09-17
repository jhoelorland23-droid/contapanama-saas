const { AsyncLocalStorage } = require('node:async_hooks');

// Each request sees one snapshot. Writers work on a private draft, serialized
// until durable commit; a late handler can never overwrite a newer request.
function createLocalStateStore(initial) {
  let committed = initial;
  let queue = Promise.resolve();
  const context = new AsyncLocalStorage();
  const current = () => context.getStore()?.draft || committed;
  const state = new Proxy(initial, {
    get: (_target, key) => current()[key],
    set: (_target, key, value) => { current()[key] = value; return true; },
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Object.getOwnPropertyDescriptor(current(), key);
      return descriptor && { ...descriptor, configurable: true };
    },
  });

  function middleware({ beforeCommit = () => {}, persist, timeoutMs = 30000 }) {
    return (req, res, next) => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return context.run({ draft: committed }, next);
      }
      let release;
      const previous = queue;
      queue = new Promise(resolve => { release = resolve; });
      previous.then(() => {
        if (res.destroyed) { release(); return; }
        const before = committed;
        const request = { draft: structuredClone(before), finished: false };
        context.run(request, () => {
          const originalJson = res.json;
          let timer;
          const finish = () => {
            if (request.finished) return;
            request.finished = true;
            clearTimeout(timer);
            release();
          };
          res.json = function json(body) {
            if (request.finished) return res;
            try {
              if (res.statusCode < 400) {
                beforeCommit(before, req);
                const nextState = structuredClone(request.draft);
                persist(nextState);
                committed = nextState;
              }
            } catch (error) {
              res.statusCode = error.status || 503;
              body = { error: error.status ? error.message : 'No se pudo guardar la operacion. No se aplicaron cambios.' };
            }
            finish();
            return originalJson.call(res, body);
          };
          // Non-JSON error responses discard the draft. Successful writes use json().
          res.once('finish', finish);
          timer = setTimeout(() => {
            if (!request.finished) {
              res.statusCode = 503;
              res.json({ error: 'La operacion excedio el tiempo de espera. No se aplicaron cambios.' });
            }
          }, timeoutMs);
          timer.unref?.();
          try { next(); } catch (error) { next(error); }
        });
      }).catch(error => { release(); next(error); });
    };
  }
  return { state, middleware, snapshot: () => structuredClone(committed) };
}

module.exports = { createLocalStateStore };
