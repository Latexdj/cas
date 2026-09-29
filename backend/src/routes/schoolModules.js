// Cross-portal, read-only module visibility. GET /api/admin/modules (in
// admin.js) requires adminOnly, so a principal (type:'management', role is
// their management_role, e.g. 'principal') or a non-admin teacher token gets
// a 403 calling it directly — neither is an 'admin' role. Every portal's nav
// needs the same enabled-module list to decide what to show, so this is
// deliberately gated only by authenticate + requireActiveSubscription (any
// logged-in role for the school), not adminOnly.
const router = require('express').Router();
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { getEnabledModules } = require('../services/modules.service');

router.use(authenticate, requireActiveSubscription);

// GET /api/school-modules/enabled — the enabled module keys for the caller's school
router.get('/enabled', async (req, res, next) => {
  try {
    const modules = await getEnabledModules(req.schoolId);
    res.json(modules);
  } catch (err) { next(err); }
});

module.exports = router;
