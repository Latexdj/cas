'use strict';

// Shared sensitivity gate for AI letter drafting, used at session start
// (letter-chat.js) and again whenever a returned letter's session is
// revived (letterApproval.service.js) — a letter returned for correction
// must never regain access to AI drafting for a category that was never
// allowed to begin with.
//
// 'other' is too vague for grounded AI drafting.
// suspension/dismissal carry legal weight — AI never produces those.
const SENSITIVE_OFFENSE_CATS  = new Set(['other']);
const SENSITIVE_LETTER_TYPES  = new Set(['suspension', 'dismissal']);

function isBlocked(documentType, metadata) {
  if (documentType !== 'student_letter') return false;
  if (SENSITIVE_OFFENSE_CATS.has(metadata?.offense_category)) return true;
  if (SENSITIVE_LETTER_TYPES.has(metadata?.letter_type))       return true;
  return false;
}

module.exports = { isBlocked };
