const router = require('express').Router();
const crypto = require('crypto');
const QRCode  = require('qrcode');
const pool    = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

/** Fetch (or lazily generate) a school's dedicated QR secret. */
async function getSchoolSecret(schoolId) {
  const { rows } = await pool.query(
    'SELECT qr_secret FROM schools WHERE id = $1',
    [schoolId]
  );
  if (rows[0]?.qr_secret) return rows[0].qr_secret;

  // First use — generate and persist a per-school secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'UPDATE schools SET qr_secret = $1 WHERE id = $2',
    [newSecret, schoolId]
  );
  return newSecret;
}

async function buildToken(schoolId, className) {
  const schoolSecret = await getSchoolSecret(schoolId);
  const hmac = crypto
    .createHmac('sha256', schoolSecret)
    .update(`${schoolId}:${className}`)
    .digest('hex')
    .slice(0, 16);
  return `cas-qr:${schoolId}:${className}:${hmac}`;
}

function parseToken(token) {
  const parts = token.split(':');
  if (parts.length < 4 || parts[0] !== 'cas-qr') return null;
  const schoolId  = parts[1];
  const hmac      = parts[parts.length - 1];
  const className = parts.slice(2, -1).join(':');
  return { schoolId, className, hmac };
}

/** GET /api/classroom-qr/info — return rotation metadata for this school (admin) */
router.get('/info', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT qr_rotated_at FROM schools WHERE id = $1',
      [req.schoolId]
    );
    res.json({ qr_rotated_at: rows[0]?.qr_rotated_at ?? null });
  } catch (err) { next(err); }
});

/** POST /api/classroom-qr/rotate — generate a new secret, invalidating all printed codes (admin) */
router.post('/rotate', adminOnly, async (req, res, next) => {
  try {
    const newSecret = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'UPDATE schools SET qr_secret = $1, qr_rotated_at = now() WHERE id = $2',
      [newSecret, req.schoolId]
    );
    res.json({ message: 'QR codes rotated. Reprint and replace all classroom codes.' });
  } catch (err) { next(err); }
});

/** GET /api/classroom-qr/classes — list all active class names (admin) */
router.get('/classes', adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT class_name FROM students
       WHERE school_id = $1 AND status = 'Active'
       ORDER BY class_name`,
      [req.schoolId]
    );
    res.json(rows.map(r => r.class_name));
  } catch (err) { next(err); }
});

/** GET /api/classroom-qr/token?class_name=1A — return token string (admin) */
router.get('/token', adminOnly, async (req, res, next) => {
  try {
    const { class_name } = req.query;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });
    const token = await buildToken(req.schoolId, class_name);
    res.json({ token, class_name });
  } catch (err) { next(err); }
});

/** GET /api/classroom-qr/image?class_name=1A — return QR as PNG (admin) */
router.get('/image', adminOnly, async (req, res, next) => {
  try {
    const { class_name } = req.query;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });
    const token = await buildToken(req.schoolId, class_name);
    const png   = await QRCode.toBuffer(token, { errorCorrectionLevel: 'M', width: 280 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) { next(err); }
});

/** POST /api/classroom-qr/verify — teacher scans a QR; verify it matches selected class */
router.post('/verify', async (req, res, next) => {
  try {
    const { token, expectedClassName } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const parsed = parseToken(token.trim());
    if (!parsed) return res.status(400).json({ error: 'Invalid QR code format' });

    if (parsed.schoolId !== req.schoolId) {
      return res.status(403).json({ error: 'QR code belongs to a different school' });
    }

    const expected     = await buildToken(req.schoolId, parsed.className);
    const expectedHmac = parseToken(expected).hmac;
    if (parsed.hmac !== expectedHmac) {
      return res.status(400).json({ error: 'QR code is invalid or has been tampered with' });
    }

    if (expectedClassName) {
      const slotClasses = expectedClassName.split(',').map(c => c.trim().toLowerCase());
      if (!slotClasses.includes(parsed.className.toLowerCase())) {
        return res.status(400).json({
          error: `This QR is for ${parsed.className} but your lesson is for ${expectedClassName}. Please scan the correct classroom QR.`,
        });
      }
    }

    res.json({ valid: true, className: parsed.className });
  } catch (err) { next(err); }
});

module.exports = router;
