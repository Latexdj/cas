// PostgreSQL error codes → safe user-facing messages
const PG_MESSAGES = {
  '23505': 'A record with that information already exists.',
  '23503': 'Related record not found.',
  '23502': 'A required field is missing.',
  '22001': 'A value exceeds the maximum allowed length.',
  '22003': 'A numeric value is out of the allowed range.',
  '22P02': 'Invalid ID format.',       // invalid input syntax for type uuid
  '42703': 'Internal server error.',   // undefined column (schema bug)
  '42P01': 'Internal server error.',   // undefined table  (schema bug)
};

function errorHandler(err, _req, res, _next) {
  console.error(err);

  // Errors thrown explicitly by route handlers carry a .status and a
  // safe, human-written message — pass those through unchanged.
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  // Map PostgreSQL errors to safe messages so internal schema details
  // are never exposed to clients.
  if (err.code && PG_MESSAGES[err.code]) {
    return res.status(400).json({ error: PG_MESSAGES[err.code] });
  }

  // Catch-all: never leak err.message for unknown server errors.
  res.status(500).json({ error: 'Internal server error.' });
}

function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

module.exports = { errorHandler, notFound };
