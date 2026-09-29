const { getEnabledModules } = require('../services/modules.service');

// In-memory cache of a school's enabled module keys — mirrors the pattern
// used for subscription status in auth.js's requireActiveSubscription.
const moduleCache = new Map(); // schoolId -> { keys: Set<string>, cachedAt }
const MODULE_CACHE_TTL_MS = 5 * 60 * 1000;

function clearModuleCache(schoolId) {
  if (schoolId) moduleCache.delete(schoolId);
  else moduleCache.clear();
}

async function getCachedEnabledKeys(schoolId) {
  const cached = moduleCache.get(schoolId);
  if (cached && (Date.now() - cached.cachedAt) < MODULE_CACHE_TTL_MS) {
    return cached.keys;
  }
  const enabled = await getEnabledModules(schoolId);
  const keys = new Set(enabled);
  moduleCache.set(schoolId, { keys, cachedAt: Date.now() });
  return keys;
}

// Gates a route behind a licensed module. Disabling a module is an
// archive/read-only-lock, not a data wipe: an admin can still GET their
// school's existing data for that module (nothing looks lost, nothing needs
// re-entering if the module is re-enabled later), but every other role loses
// access outright, and every write (non-GET) is blocked regardless of role.
// Super admin always bypasses, matching requireActiveSubscription.
function checkModuleAccess(moduleKey) {
  return async function (req, res, next) {
    if (req.user?.role === 'super_admin') return next();
    if (!req.schoolId) {
      return res.status(400).json({ error: 'School context required' });
    }
    try {
      const enabledKeys = await getCachedEnabledKeys(req.schoolId);
      if (enabledKeys.has(moduleKey)) return next();

      const isAdminRead = req.method === 'GET' && req.user?.role === 'admin';
      if (isAdminRead) return next();

      return res.status(403).json({
        error: 'module_not_enabled',
        message: `The ${moduleKey} module is not enabled for this school.`,
      });
    } catch (err) {
      next(err);
    }
  };
}

// Non-middleware helper for call sites that resolve schoolId outside the
// normal authenticate() flow (e.g. the public admissions portal, which
// looks up a school by portal slug rather than by JWT).
async function isModuleEnabledForSchool(schoolId, moduleKey) {
  const enabledKeys = await getCachedEnabledKeys(schoolId);
  return enabledKeys.has(moduleKey);
}

module.exports = { checkModuleAccess, clearModuleCache, isModuleEnabledForSchool };
