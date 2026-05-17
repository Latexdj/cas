const rateLimit = require('express-rate-limit');

function makeLimiter({ max, windowMinutes, message }) {
  return rateLimit({
    windowMs:          windowMinutes * 60 * 1000,
    max,
    standardHeaders:   true,   // Retry-After header
    legacyHeaders:     false,
    skipSuccessfulRequests: false,
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

/** POST /api/auth/login — teacher PIN (4 digits = 10k combos) */
const loginLimiter = makeLimiter({
  max:           10,
  windowMinutes: 15,
  message:       'Too many login attempts. Please wait 15 minutes before trying again.',
});

/** GET /api/auth/school/:code — school code lookup */
const schoolLookupLimiter = makeLimiter({
  max:           20,
  windowMinutes: 15,
  message:       'Too many school lookup attempts. Please wait 15 minutes before trying again.',
});

/** POST /api/auth/super-admin — highest privilege */
const superAdminLimiter = makeLimiter({
  max:           5,
  windowMinutes: 15,
  message:       'Too many super admin login attempts. Please wait 15 minutes before trying again.',
});

module.exports = { loginLimiter, schoolLookupLimiter, superAdminLimiter };
