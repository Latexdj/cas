'use strict';

const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { publicWaecAuthLimiter } = require('../middleware/rateLimiter');

function signToken(payload, expiresIn) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// 30 days, not the few hours institutional logins use — this is a consumer
// account on a personal device, not a shared school workstation.
const TOKEN_EXPIRY = '30d';

router.post('/signup', publicWaecAuthLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : null;

    if (!name) return res.status(400).json({ error: 'Your name is required.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let userId;
    try {
      const { rows } = await pool.query(
        `INSERT INTO public_waec_users (name, email, password_hash, phone)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, email, passwordHash, phone]
      );
      userId = rows[0].id;
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
      throw e;
    }

    const token = signToken({ id: userId, email, role: 'public_waec_user' }, TOKEN_EXPIRY);
    return res.json({ token, id: userId, name, email });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', publicWaecAuthLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash FROM public_waec_users WHERE email = $1`,
      [email]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken({ id: user.id, email: user.email, role: 'public_waec_user' }, TOKEN_EXPIRY);
    return res.json({ token, id: user.id, name: user.name, email: user.email });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
