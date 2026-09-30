const { getEnabledModules, getAdminAllowedModules } = require('../services/modules.service');

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

// Per-admin module restriction cache — separate from the school-level cache
// above, keyed by teacher id. `allowed === null` means unrestricted (full
// access to whatever the school licenses). Explicitly invalidated by the
// admin-module-access write route the moment an admin's access changes —
// this cache must never rely on TTL expiry alone the way earlier phases of
// this codebase sometimes did, since a stale entry here would either wrongly
// lock someone out or wrongly leave them with access that was just revoked.
const adminModuleCache = new Map(); // teacherId -> { allowed: string[]|null, cachedAt }
const ADMIN_MODULE_CACHE_TTL_MS = 5 * 60 * 1000;

function clearAdminModuleCache(teacherId) {
  if (teacherId) adminModuleCache.delete(teacherId);
  else adminModuleCache.clear();
}

async function getCachedAdminAllowed(teacherId) {
  const cached = adminModuleCache.get(teacherId);
  if (cached && (Date.now() - cached.cachedAt) < ADMIN_MODULE_CACHE_TTL_MS) {
    return cached.allowed;
  }
  const allowed = await getAdminAllowedModules(teacherId);
  adminModuleCache.set(teacherId, { allowed, cachedAt: Date.now() });
  return allowed;
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
      // Per-admin restriction is checked first and independently of the
      // school-level enabled/disabled state below — a restricted admin must
      // not be able to reach a module they were never granted just because
      // that module happens to be disabled school-wide (which would let them
      // ride the admin-GET archive bypass into data they shouldn't see).
      const isAdminIdentity = req.user?.role === 'admin' || req.user?.type === 'management';
      if (isAdminIdentity) {
        const allowed = await getCachedAdminAllowed(req.user.id);
        if (allowed !== null && !allowed.includes(moduleKey)) {
          return res.status(403).json({
            error: 'module_access_restricted',
            message: `You do not have access to the ${moduleKey} module.`,
          });
        }
      }

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

// Guards actions that grant or edit admin-level access — creating another
// admin, promoting someone to principal/vice_principal, or editing anyone's
// module scope. Only a caller who is themselves unrestricted may do these; a
// restricted admin cannot manage admin accounts at all (locked decision —
// not "can only grant a subset of their own access", simply blocked outright).
async function requireUnrestrictedAdmin(req, res, next) {
  if (req.user?.role === 'super_admin') return next();
  try {
    const allowed = await getCachedAdminAllowed(req.user.id);
    if (allowed !== null) {
      return res.status(403).json({
        error: 'restricted_admin',
        message: 'Your admin account is module-restricted and cannot manage other admin accounts.',
      });
    }
    next();
  } catch (err) { next(err); }
}

module.exports = {
  checkModuleAccess, clearModuleCache, clearAdminModuleCache, isModuleEnabledForSchool,
  requireUnrestrictedAdmin,
};
