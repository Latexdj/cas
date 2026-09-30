// Cross-portal, read-only module visibility. GET /api/admin/modules (in
// admin.js) requires adminOnly, so a principal (type:'management', role is
// their management_role, e.g. 'principal') or a non-admin teacher token gets
// a 403 calling it directly — neither is an 'admin' role. Every portal's nav
// needs the same enabled-module list to decide what to show, so this is
// deliberately gated only by authenticate + requireActiveSubscription (any
// logged-in role for the school), not adminOnly.
const router = require('express').Router();
const { authenticate, requireActiveSubscription } = require('../middleware/auth');
const { getEffectiveModules } = require('../services/modules.service');

router.use(authenticate, requireActiveSubscription);

// GET /api/school-modules/enabled — the module keys the CALLER may use: the
// school's own license, further intersected with that admin's own allowed
// set if they've been restricted via admin_module_access (see
// getEffectiveModules). Unrestricted callers (every non-admin role, and any
// admin/management identity with no admin_module_access rows) get back
// exactly the school's license, unchanged from before this existed.
router.get('/enabled', async (req, res, next) => {
  try {
    const modules = await getEffectiveModules(req.schoolId, req.user);
    res.json(modules);
  } catch (err) { next(err); }
});

module.exports = router;
