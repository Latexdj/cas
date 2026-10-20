const rateLimit = require('express-rate-limit');

function makeLimiter({ max, windowMinutes, message, skipSuccessful = false }) {
  return rateLimit({
    windowMs:               windowMinutes * 60 * 1000,
    max,
    standardHeaders:        true,
    legacyHeaders:          false,
    skipSuccessfulRequests: skipSuccessful,
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

/** POST /api/auth/login — only failed attempts count toward the limit */
const loginLimiter = makeLimiter({
  max:             20,
  windowMinutes:   15,
  skipSuccessful:  true,
  message:         'Too many failed login attempts. Please wait 15 minutes before trying again.',
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

/** POST /api/website/:slug/contact — a public, unauthenticated form */
const contactFormLimiter = makeLimiter({
  max:           5,
  windowMinutes: 15,
  message:       'Too many messages sent. Please wait 15 minutes before trying again.',
});

/** POST /api/public/waec-results/initialize — a public, unauthenticated checkout start */
const publicWaecInitLimiter = makeLimiter({
  max:           10,
  windowMinutes: 15,
  message:       'Too many attempts. Please wait 15 minutes before trying again.',
});

/** POST /api/public/waec-results/:id/generate — a public, unauthenticated report generation */
const publicWaecGenerateLimiter = makeLimiter({
  max:           10,
  windowMinutes: 15,
  message:       'Too many attempts. Please wait 15 minutes before trying again.',
});

/** GET /api/public/waec-results/:id/download.(pdf|xlsx) — each launches a
 *  headless-Chromium render, so it's rate-limited like /generate even
 *  though it's a GET, not just a lighter read. */
const publicWaecDownloadLimiter = makeLimiter({
  max:           15,
  windowMinutes: 15,
  message:       'Too many download attempts. Please wait 15 minutes before trying again.',
});

/** POST /api/public/waec-auth/(signup|login) — a public, unauthenticated account login */
const publicWaecAuthLimiter = makeLimiter({
  max:            20,
  windowMinutes:  15,
  skipSuccessful: true,
  message:        'Too many attempts. Please wait 15 minutes before trying again.',
});

module.exports = {
  loginLimiter,
  schoolLookupLimiter,
  superAdminLimiter,
  contactFormLimiter,
  publicWaecInitLimiter,
  publicWaecGenerateLimiter,
  publicWaecDownloadLimiter,
  publicWaecAuthLimiter,
};
