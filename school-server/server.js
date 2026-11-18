'use strict';
// CAS-LAUNCHER
// Starts the CAS School Server (app.js) and protects it from a bad update.
//
// run.bat starts this file and starts it again whenever it stops. After an
// update is installed, data/update-state.json says "trial". Each start during
// the trial counts an attempt; app.js ends the trial once it has run for
// 90 seconds. If the new version fails to start three times, this launcher
// copies the previous version back from its backup and the server carries on.
//
// Keep this file small and simple: updates do not replace it.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const STATE = path.join(DATA, 'update-state.json');
const MAX_ATTEMPTS = 3;

function logLine(msg) {
  try { fs.appendFileSync(path.join(DATA, 'server.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch { /* no log */ }
}
function copyTree(from, to) {
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, d.name), b = path.join(to, d.name);
    if (d.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyTree(a, b); }
    else fs.copyFileSync(a, b);
  }
}

let state = null;
try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { /* no update in progress */ }
if (state && state.status === 'trial') {
  state.attempts = (state.attempts || 0) + 1;
  if (state.attempts > MAX_ATTEMPTS && state.backup && fs.existsSync(state.backup)) {
    try {
      copyTree(state.backup, ROOT);
      state.status = 'rolled-back';
      state.rolled_back_at = new Date().toISOString();
      logLine(`server update ${state.to} did not start; went back to ${state.from}`);
    } catch (e) {
      logLine(`server update rollback failed: ${e.message}`);
    }
  }
  try { fs.writeFileSync(STATE, JSON.stringify(state, null, 2)); } catch { /* read-only disk */ }
}

require('./app.js');
