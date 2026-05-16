const router = require('express').Router();
const crypto = require('crypto');
const QRCode  = require('qrcode');
const pool    = require('../config/db');
const { authenticate, adminOnly, requireActiveSubscription } = require('../middleware/auth');

router.use(authenticate, requireActiveSubscription);

function secret() {
  return process.env.QR_SECRET || process.env.JWT_SECRET || 'cas-qr-fallback';
}

function buildToken(schoolId, className) {
  const hmac = crypto
    .createHmac('sha256', secret())
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
router.get('/token', adminOnly, (req, res) => {
  const { class_name } = req.query;
  if (!class_name) return res.status(400).json({ error: 'class_name is required' });
  res.json({ token: buildToken(req.schoolId, class_name), class_name });
});

/** GET /api/classroom-qr/image?class_name=1A — return QR as PNG (admin) */
router.get('/image', adminOnly, async (req, res, next) => {
  try {
    const { class_name } = req.query;
    if (!class_name) return res.status(400).json({ error: 'class_name is required' });
    const token = buildToken(req.schoolId, class_name);
    const png   = await QRCode.toBuffer(token, { errorCorrectionLevel: 'M', width: 280 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) { next(err); }
});

/** POST /api/classroom-qr/verify — teacher scans a QR; verify it matches selected class */
router.post('/verify', async (req, res) => {
  const { token, expectedClassName } = req.body;
  if (!token) return res.status(400).json({ error: 'token is required' });

  const parsed = parseToken(token.trim());
  if (!parsed) return res.status(400).json({ error: 'Invalid QR code format' });

  if (parsed.schoolId !== req.schoolId) {
    return res.status(403).json({ error: 'QR code belongs to a different school' });
  }

  const expected = buildToken(req.schoolId, parsed.className);
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
});

module.exports = router;
