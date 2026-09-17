const attempts = new Map();

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

function keyFromRequest(req) {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `${ip}:${email}`;
}

function createLoginRateLimit(options = {}) {
  const maxAttempts = Number(options.maxAttempts || process.env.LOGIN_RATE_LIMIT_MAX || DEFAULT_MAX_ATTEMPTS);
  const windowMs = Number(options.windowMs || process.env.LOGIN_RATE_LIMIT_WINDOW_MS || DEFAULT_WINDOW_MS);
  const store = options.store || attempts;

  return (req, res, next) => {
    const key = keyFromRequest(req);
    const now = Date.now();
    const current = store.get(key);

    if (current && current.resetAt > now && current.count >= maxAttempts) {
      const retryAfter = Math.ceil((current.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Demasiados intentos de inicio de sesion. Intente nuevamente mas tarde.',
      });
    }

    req.loginRateLimit = {
      fail() {
        const existing = store.get(key);
        if (!existing || existing.resetAt <= now) {
          store.set(key, { count: 1, resetAt: now + windowMs });
          return;
        }
        existing.count += 1;
        store.set(key, existing);
      },
      success() {
        store.delete(key);
      },
    };

    next();
  };
}

module.exports = {
  createLoginRateLimit,
};
