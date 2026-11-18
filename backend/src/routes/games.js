'use strict';
// Learning games (student app): when games are open, scores, leaderboards.
//
//   GET  /api/games/schedule                       the student's class lessons and days off
//   POST /api/games/scores        { scores: [...] } this device's plays (ids from the device)
//   GET  /api/games/leaderboard?game=&scope=class|school
//
// Tablets on the school Wi-Fi go through the school server instead
// (routes/school-server.js, /games/...).

const router = require('express').Router();
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const games = require('../services/games.service');

const studentOnly = (req, res, next) => (req.user?.role === 'student' ? next() : res.status(403).json({ error: 'For students only.' }));
router.use(authenticate, studentOnly);

router.get('/schedule', async (req, res, next) => {
  try {
    const { rows: [me] } = await pool.query(`SELECT class_name FROM students WHERE id=$1 AND school_id=$2`, [req.user.id, req.schoolId]);
    res.json(await games.scheduleFor(req.schoolId, me?.class_name));
  } catch (e) { next(e); }
});

router.post('/scores', async (req, res, next) => {
  try {
    const list = (Array.isArray(req.body?.scores) ? req.body.scores : []).slice(0, 500)
      .filter(r => r && /^[0-9a-f-]{36}$/i.test(String(r.id)))
      .map(r => ({ ...r, student_id: req.user.id }));
    res.json({ saved: await games.saveScores(req.schoolId, list), received: list.length });
  } catch (e) { next(e); }
});

router.get('/leaderboard', async (req, res, next) => {
  try {
    const game = String(req.query.game || '');
    if (!games.GAMES.has(game)) return res.status(400).json({ error: 'Unknown game.' });
    res.json(await games.leaderboard(req.schoolId, game, req.user.id, req.query.scope === 'school' ? 'school' : 'class'));
  } catch (e) { next(e); }
});

module.exports = router;
