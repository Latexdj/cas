'use strict';
// @sparticuz/chromium v149+ ships as an ES module; require() gives the module
// wrapper with the real API on .default. Earlier versions exposed it directly.
const _chromiumPkg = require('@sparticuz/chromium');
const chromium  = _chromiumPkg.default || _chromiumPkg;
const puppeteer = require('puppeteer-core');
const QRCode    = require('qrcode');
const https     = require('https');
const http      = require('http');
const supabase  = require('../config/supabase');
const { renderSubjectPassRateChartSVG } = require('../utils/waecChartSvg');

const BUCKET = process.env.STORAGE_BUCKET || 'attendance-photos';

// chromium.args (from @sparticuz/chromium) is a Lambda/Linux-specific flag
// set — --single-process, --no-zygote, --use-gl=angle/--use-angle=
// swiftshader, --headless='shell', etc. — tuned for the *specific* Chromium
// binary that package's own executablePath() resolves to. resolveChromePath()
// only uses that binary on Linux; everywhere else (Windows/macOS local dev)
// it launches a normal installed Chrome instead, and those same flags crash
// it outright on launch ("Failed to launch the browser process: Code:
// 2147483651", confirmed directly — no stderr, no error message, just a
// dead child process) rather than merely being ignored. Scoping
// chromium.args to Linux only means production (which always resolves the
// matching @sparticuz/chromium binary) is byte-for-byte unaffected, while
// local Windows/macOS dev — previously unable to generate a single PDF —
// now can.
function chromeLaunchArgs() {
  return [
    ...(process.platform === 'linux' ? (chromium.args ?? []) : []),
    '--no-sandbox', '--disable-setuid-sandbox',
  ];
}

// Converts a hex color to rgba() so we can produce tints without an extra dep.
function hexRgba(hex, alpha) {
  const h = (hex || '#0B3D2E').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A letter body is either rich HTML from the shared TipTap editor (sanitized
// server-side at write time — see utils/richTextSanitizer.js — so safe to
// emit unescaped here) or, for a letter issued before that editor existed,
// plain text with no markup of its own. Detect which by whether it starts
// with a tag at all; a legacy plain-text body still needs esc() + its raw
// line breaks preserved, exactly as this always rendered before.
function renderBody(body) {
  if (/^\s*</.test(body || '')) return body || '';
  return `<div style="white-space:pre-wrap;">${esc(body || '')}</div>`;
}

// Frontend/backend can't share one module here (separate npm packages,
// separate runtimes, no monorepo tooling) -- admin-portal/components/
// PrintLetterModal.tsx has the client-side twin of this exact function, used
// for the browser print preview of the same letter data. If you fix a
// date-formatting bug here, fix it there too (that side never receives a raw
// Date object -- JSON has no Date type -- so it skips the instanceof branch).
//
// Accepts whatever shape a date can arrive in here: a plain "YYYY-MM-DD"
// string (from an explicit ::text cast in SQL), a raw JS Date object (a
// DATE column read straight off a pg row, pre-JSON), or missing entirely.
// Normalises to just the calendar date before parsing, rather than naively
// concatenating 'T00:00:00' onto whatever was received.
function fmtDate(d) {
  if (!d) return '—';
  const isoDatePart = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const parsed = new Date(isoDatePart + 'T00:00:00');
  if (isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function firstWord(name) {
  return name ? name.split(' ')[0] : 'Sir/Madam';
}

function toTitleCase(str) {
  if (!str) return '';
  const minors = new Set(['and','of','the','in','for','a','an','to','at','by','with','de']);
  return str.toLowerCase().replace(/[^\s-]+/g, (word, offset) => {
    if (offset > 0 && minors.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

// ── Admission letter template engine ─────────────────────────────────────────

const KNOWN_MERGE_FIELDS = new Set([
  'name', 'admissionNo', 'indexNumber', 'program', 'house',
  'residentialStatus', 'gender', 'aggregate',
  'date', 'reportingDate',
  'parentName', 'parentMobile',
  'schoolName', 'academicYear',
]);

// Exported so the settings route can validate before saving.
// Returns an array of unrecognised token names found in the template.
function validateTemplate(template) {
  if (!template) return [];
  return [...template.matchAll(/\{([^}]+)\}/g)]
    .map(m => m[1])
    .filter(t => !KNOWN_MERGE_FIELDS.has(t));
}

// Template is HTML (from the rich-text editor). Substitute known {tokens} with
// HTML-escaped field values; strip unknown tokens; null/empty values → "—".
// The template itself is NOT escaped — it is authored HTML from the admin editor.
function mergeTemplate(template, fields) {
  return template.replace(/\{([^}]+)\}/g, (match, token) => {
    if (!KNOWN_MERGE_FIELDS.has(token)) return '';
    const raw = fields[token];
    if (raw == null || raw === '') return '—';
    return esc(String(raw));
  });
}

// Default HTML body template. Date and reference number are rendered as
// structural elements above this block, so they are not repeated here.
const DEFAULT_ADMISSION_LETTER_TEMPLATE =
`<p>Dear <strong>{name}</strong>,</p>
<p style="text-align:justify;">We are pleased to inform you that you have been offered admission to <strong>{schoolName}</strong> for the <strong>{academicYear}</strong> academic year, subject to verification of the information provided.</p>
<p><strong>Your Admission Details</strong></p>
<p>
  Admission Number: <strong>{admissionNo}</strong><br>
  Full Name: <strong>{name}</strong><br>
  Index Number: <strong>{indexNumber}</strong><br>
  Programme: <strong>{program}</strong><br>
  House: <strong>{house}</strong><br>
  Residential Status: <strong>{residentialStatus}</strong><br>
  Gender: <strong>{gender}</strong><br>
  Aggregate: <strong>{aggregate}</strong>
</p>
<p><strong>Reporting Requirements</strong></p>
<ul>
  <li>Report to the school on or before <strong>{reportingDate}</strong> with this admission letter.</li>
  <li>Bring your original BECE result slip for verification.</li>
  <li>Bring your Ghana Card or Birth Certificate (original and photocopy).</li>
  <li>Pay the required fees at the Finance Office upon arrival.</li>
</ul>
<p style="text-align:justify;">We look forward to welcoming you to our school community.</p>`;

// Puppeteer footerTemplate — modern two-panel design.
// Left (off-white): logo in tinted badge + vision/mission behind accent left-border.
// Right (primary gradient, angled edge): icon-led contact rows + circular page badge.
// Returns null when the school has nothing to show (no footer rendered).
function buildFooterHtml(school) {
  const rawColor  = school.primary_color || '#0B3D2E';
  const color     = esc(rawColor);
  const tint8     = hexRgba(rawColor, 0.08);
  const tint22    = hexRgba(rawColor, 0.22);

  // ── Left panel: logo badge ────────────────────────────────────────────────
  const logoInner = school.logo_url
    ? `<img src="${esc(school.logo_url)}" style="width:28px;height:28px;object-fit:contain;" />`
    : `<svg style="width:24px;height:24px;" viewBox="0 0 24 24" fill="${color}">
         <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM3.82 9L12 4.53 20.18 9 12 13.47
                  3.82 9zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>
       </svg>`;
  const logoBadge = `<div style="
      width:42px;height:42px;flex-shrink:0;border-radius:9px;
      background:${tint8};border:1px solid ${tint22};
      display:flex;align-items:center;justify-content:center;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;">
    ${logoInner}
  </div>`;

  // ── Left panel: statements ────────────────────────────────────────────────
  const stmts = [];
  if (school.vision)  stmts.push(`<p style="margin:0 0 2px;font-size:6.5pt;color:#444;line-height:1.5;">
    <span style="font-weight:700;letter-spacing:0.02em;color:${color};">VISION</span>
    <span style="color:${tint22};margin:0 4px;">|</span>${esc(school.vision)}</p>`);
  if (school.mission) stmts.push(`<p style="margin:0;font-size:6.5pt;color:#444;line-height:1.5;">
    <span style="font-weight:700;letter-spacing:0.02em;color:${color};">MISSION</span>
    <span style="color:${tint22};margin:0 4px;">|</span>${esc(school.mission)}</p>`);

  // ── Right panel: contact rows ─────────────────────────────────────────────
  const emailIcon = `<svg style="width:10px;height:10px;fill:#fff;flex-shrink:0;opacity:0.85;" viewBox="0 0 24 24">
    <path d="M20 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
  const phoneIcon = `<svg style="width:10px;height:10px;fill:#fff;flex-shrink:0;opacity:0.85;" viewBox="0 0 24 24">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24
             1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17
             0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
  const addrIcon  = `<svg style="width:10px;height:10px;fill:#fff;flex-shrink:0;opacity:0.85;" viewBox="0 0 24 24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5
             c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;

  const contacts = [];
  if (school.email)   contacts.push(`<div style="display:flex;align-items:center;gap:5px;font-size:6.5pt;margin-bottom:3px;">${emailIcon}<span style="opacity:0.95;">${esc(school.email)}</span></div>`);
  if (school.phone)   contacts.push(`<div style="display:flex;align-items:center;gap:5px;font-size:6.5pt;margin-bottom:3px;">${phoneIcon}<span style="opacity:0.95;">Tel: ${esc(school.phone)}</span></div>`);
  if (school.address) contacts.push(`<div style="display:flex;align-items:center;gap:5px;font-size:6.5pt;">${addrIcon}<span style="opacity:0.95;">${esc(school.address)}</span></div>`);

  if (!stmts.length && !contacts.length && !school.logo_url) return null;

  return `<div style="
      width:100%;display:flex;align-items:stretch;
      background:#fafafa;border-top:3px solid ${color};
      font-family:Arial,Helvetica,sans-serif;overflow:hidden;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;">

    <div style="flex:1;display:flex;align-items:center;padding:10px 20px;gap:14px;">
      ${logoBadge}
      <div style="border-left:2px solid ${tint22};padding-left:12px;flex:1;">
        ${stmts.join('') || '&nbsp;'}
      </div>
    </div>

    <div style="
        background:linear-gradient(to right,${color} 0%,rgba(0,0,0,0.14) 100%),${color};
        color:#fff;display:flex;align-items:center;gap:14px;
        padding:10px 22px 10px 30px;
        clip-path:polygon(16px 0,100% 0,100% 100%,0 100%);
        -webkit-print-color-adjust:exact;print-color-adjust:exact;">
      <div>${contacts.join('') || '&nbsp;'}</div>
      <div style="
          width:28px;height:28px;border-radius:50%;flex-shrink:0;
          background:rgba(255,255,255,0.18);
          display:flex;align-items:center;justify-content:center;
          font-size:7pt;font-weight:700;
          -webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <span class="pageNumber"></span>
      </div>
    </div>
  </div>`;
}

// Fetches a remote URL and returns a base64 data URI so Puppeteer can render
// it without making any outbound network requests during PDF generation.
// Returns null on any error so callers can fall back gracefully.
async function fetchAsDataUri(url) {
  if (!url) return null;
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const contentType = res.headers['content-type'] || 'image/png';
      const mime = contentType.split(';')[0].trim();
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const b64 = Buffer.concat(chunks).toString('base64');
        resolve(`data:${mime};base64,${b64}`);
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Pre-fetches all image URLs on a school object (and optionally a per-letter
// override signature) as base64 data URIs so Puppeteer never makes outbound
// network requests during rendering. Supabase URLs without file extensions
// trigger wrong content-type headers that cause Puppeteer to drop images silently.
// On fetch failure each field is set to null so renderLetterhead/renderSig
// fall back to their text/spacer defaults.
async function resolveImages(school, extraUrls = {}) {
  const urls = [
    school.letterhead_url,
    school.headmaster_signature_url,
    school.logo_url,
    ...Object.values(extraUrls),
  ];
  const results = await Promise.all(urls.map(fetchAsDataUri));
  const resolvedSchool = {
    ...school,
    letterhead_url:           results[0] ?? null,
    headmaster_signature_url: results[1] ?? null,
    logo_url:                 results[2] ?? null,
  };
  const resolvedExtras = {};
  Object.keys(extraUrls).forEach((k, i) => { resolvedExtras[k] = results[3 + i] ?? null; });
  return { resolvedSchool, resolvedExtras };
}

function renderLetterhead(school) {
  const color = esc(school.primary_color || '#0B3D2E');
  return school.letterhead_url
    ? `<img src="${esc(school.letterhead_url)}" style="width:100%;display:block;margin-bottom:24px;" />`
    : `<div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid ${color};">
         <h2 style="margin:0 0 6px;font-size:18pt;color:${color};letter-spacing:0.02em;">${esc(school.name)}</h2>
         ${school.motto ? `<p style="margin:2px 0;font-size:10pt;font-style:italic;color:#4A3F32;">${esc(school.motto)}</p>` : ''}
         <div style="margin-top:8px;font-size:10pt;color:#4A3F32;">
           ${school.address ? `<span>${esc(school.address)}</span>` : ''}
           ${school.phone ? ` &nbsp;·&nbsp; Tel: ${esc(school.phone)}` : ''}
           ${school.email ? ` &nbsp;·&nbsp; ${esc(school.email)}` : ''}
         </div>
       </div>`;
}

function renderSig(sigUrl) {
  // Negative margin-bottom pulls the signature-line div (rendered right
  // after this) up underneath the lower portion of the image, so the
  // signature reads as sitting on the line rather than floating above it.
  return sigUrl
    ? `<img src="${esc(sigUrl)}" style="display:block;max-height:130px;max-width:280px;margin-top:12px;margin-bottom:-30px;position:relative;z-index:1;" />`
    : `<div style="margin-top:48px;"></div>`;
}

// letterKind === 'general' gets the reference-matched layout (signature
// moved right, name + personal title instead of repeating the school name,
// optional Through/cc blocks below). Anything else (discipline queries and
// student disciplinary letters, which also render through this same
// function) keeps the original flush-left, name + school-name layout
// untouched -- those are a different feature that happens to share this
// renderer, not something this reference letter is meant to restyle.
function renderSignoff({ letterKind, sigHtml, issuedByName, issuedByTitle, schoolName, throughOffice, cc }) {
  if (letterKind !== 'general') {
    return `
  <p style="margin:0;font-size:11pt;">Yours faithfully,</p>
  ${sigHtml}
  <div style="border-top:1px solid #000;width:240px;padding-top:8px;position:relative;z-index:0;">
    <div style="font-weight:bold;font-size:11pt;">${esc(issuedByName)}</div>
    <div style="font-size:10pt;color:#4A3F32;">${esc(schoolName ?? '')}</div>
  </div>`;
  }

  const throughHtml = throughOffice ? `
  <div style="margin-top:40px;font-size:11pt;line-height:1.7;">
    <div style="font-weight:bold;margin-bottom:4px;">THROUGH:</div>
    <div style="white-space:pre-line;">${esc(throughOffice)}</div>
  </div>` : '';

  const ccHtml = cc ? `
  <div style="margin-top:20px;font-size:10.5pt;line-height:1.6;">
    <strong>cc:</strong> <span style="white-space:pre-line;">${esc(cc)}</span>
  </div>` : '';

  return `
  <div style="margin-left:50%;">
    <p style="margin:0;font-size:11pt;">Yours faithfully,</p>
    ${sigHtml}
    <div style="border-top:1px solid #000;width:240px;padding-top:8px;position:relative;z-index:0;">
      <div style="font-weight:bold;font-size:11pt;">${esc(issuedByName)}</div>
      ${issuedByTitle ? `<div style="font-size:10pt;color:#4A3F32;">${esc(issuedByTitle)}</div>` : ''}
    </div>
  </div>${throughHtml}${ccHtml}`;
}

function buildLetterHTML({ letter, school, recipientType, letterKind = 'discipline', watermark = false }) {
  // A general letter issued "from the admin's own office" (letter.issued_as
  // === 'own_office') prints with that admin's own name and no signature
  // image — it isn't the Head's letter, so it shouldn't carry the Head's
  // signature. Every other case (discipline queries/letters, which don't
  // have this distinction at all, and every general letter issued "on
  // behalf of the Head" — the default, and the only behavior that existed
  // before issued_as was introduced) keeps using the Head's name+signature,
  // same as always. issued_by_id/issued_by_name on the letter record still
  // always identify the real submitting account regardless of this choice
  // — this only changes what prints.
  const ownOffice = letterKind === 'general' && letter.issued_as === 'own_office';
  const sigUrl = ownOffice ? null : (letter.issued_by_signature_url || school.headmaster_signature_url);
  const signatoryName = ownOffice ? (letter.issued_by_name || '') : (school.headmaster_name || 'The Headmaster');

  const letterheadHtml = renderLetterhead(school);

  const sigHtml = renderSig(sigUrl);

  const watermarkHtml = watermark
    ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);
                   font-size:56pt;font-weight:900;color:rgba(180,0,0,0.10);
                   white-space:nowrap;pointer-events:none;
                   font-family:Arial,Helvetica,sans-serif;letter-spacing:0.05em;z-index:0;">
         PENDING APPROVAL
       </div>`
    : '';

  const pageHead = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(school.name ?? 'Letter')} — ${esc(letter.subject)}</title>
  <style>
    @page { margin: 22mm 20mm; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt; color: #000; line-height: 1.6;
      max-width: 720px; margin: 0 auto; position: relative;
    }
    img { max-width: 100%; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  ${watermarkHtml}
  ${letterheadHtml}`;

  // ── Staff memo — header block, no salutation, no signature image ──────────
  // Deliberately does not call renderSig/renderSignoff or use signatoryName:
  // a memo's whole point is knowing which office sent it (Accountant,
  // Domestic Bursar, an HOD, etc.), not routing it through the headmaster's
  // signature the way every other document type in this pipeline does.
  if (recipientType === 'staff') {
    return `${pageHead}
  <div style="margin:0 0 28px;font-size:11pt;line-height:2.1;">
    <div><strong>TO:</strong> ${esc(letter.audience_label ?? '')}</div>
    <div><strong>FROM:</strong> ${esc(letter.issued_by_name ?? '')}${letter.issued_by_title ? `, ${esc(letter.issued_by_title)}` : ''}</div>
    <div><strong>DATE:</strong> ${fmtDate(letter.issued_date)}</div>
    ${letter.ref_number ? `<div><strong>REF:</strong> ${esc(letter.ref_number)}</div>` : ''}
    <div><strong>SUBJECT:</strong> ${esc(letter.subject)}</div>
  </div>
  <div style="border-top:1px solid #000;margin:0 0 28px;"></div>
  <div style="margin:0 0 40px;font-size:11pt;line-height:1.8;text-align:justify;">${renderBody(letter.body)}</div>
  <div style="margin-top:40px;font-size:11pt;">
    <div style="font-weight:bold;">${esc(letter.issued_by_name ?? '')}</div>
    ${letter.issued_by_title ? `<div style="font-size:10pt;color:#4A3F32;">${esc(letter.issued_by_title)}</div>` : ''}
  </div>
</body>
</html>`;
  }

  // ── External / parent recipients — formal business-letter format ──────────
  if (recipientType === 'external') {
    const extName  = letter.ext_recipient_name  || '';
    const extTitle = letter.ext_recipient_title || '';
    const extOrg   = letter.ext_recipient_org   || '';
    const extAddr  = letter.ext_recipient_address || '';
    // No fallback to "Dear Sir/Madam," -- when there's no personal name (e.g.
    // addressed to "THE PTA CHAIRMAN" by title only), the reference format
    // omits the salutation line entirely rather than guessing one.
    const salutation = extName ? `<p style="margin:0 0 16px;font-size:11pt;">Dear ${esc(extName)},</p>` : '';
    return `${pageHead}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 28px;font-size:11pt;">
    <div>${letter.ref_number ? `<strong>Ref:</strong> ${esc(letter.ref_number)}` : ''}</div>
    <div><strong>Date:</strong> ${fmtDate(letter.issued_date)}</div>
  </div>
  <div style="margin:0 0 28px;font-size:11pt;line-height:1.9;">
    ${extName  ? `<div style="font-weight:bold;">${esc(extName)}</div>` : ''}
    ${extTitle ? `<div style="font-weight:bold;">${esc(extTitle)}</div>` : ''}
    ${extOrg   ? `<div>${esc(extOrg)}</div>` : ''}
    ${extAddr  ? `<div style="white-space:pre-line;">${esc(extAddr)}</div>` : ''}
  </div>
  <div style="margin:0 0 24px;font-size:13pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;text-align:center;">
    RE: ${esc(letter.subject)}
  </div>
  ${salutation}
  <div style="margin:0 0 40px;font-size:11pt;line-height:1.8;text-align:justify;">${renderBody(letter.body)}</div>
  ${renderSignoff({
    letterKind, sigHtml, issuedByName: signatoryName, issuedByTitle: letter.issued_by_title,
    schoolName: school.name, throughOffice: letter.through_office, cc: letter.cc,
  })}
</body>
</html>`;
  }

  // ── Internal recipients (student / teacher) — existing format ─────────────
  const recipientName = recipientType === 'student' ? letter.student_name : letter.teacher_name;
  const recipientSub  = recipientType === 'student'
    ? [letter.class_name, letter.student_code].filter(Boolean).join(' · ')
    : (letter.department ?? '');

  return `${pageHead}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 20px;font-size:11pt;">
    <div><strong>Ref:</strong> ${esc(letter.ref_number ?? '—')}</div>
    <div><strong>Date:</strong> ${fmtDate(letter.issued_date)}</div>
  </div>
  <div style="margin:0 0 24px;font-size:11pt;line-height:1.7;">
    <div>To:</div>
    <div style="font-weight:bold;">${esc(recipientName ?? '')}</div>
    ${recipientSub ? `<div style="color:#4A3F32;">${esc(recipientSub)}</div>` : ''}
  </div>
  <div style="margin:0 0 24px;font-size:13pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;text-align:center;">
    ${esc(letter.subject)}
  </div>
  <p style="margin:0 0 16px;font-size:11pt;">Dear ${esc(firstWord(recipientName))},</p>
  <div style="margin:0 0 40px;font-size:11pt;line-height:1.8;text-align:justify;">${renderBody(letter.body)}</div>
  ${renderSignoff({
    letterKind, sigHtml, issuedByName: signatoryName, issuedByTitle: letter.issued_by_title,
    schoolName: school.name, throughOffice: letter.through_office, cc: letter.cc,
  })}
</body>
</html>`;
}

// Shared Puppeteer render → upload → public URL helper.
// options.footerTemplate: Puppeteer footerTemplate HTML string (enables displayHeaderFooter)
// options.bottomMargin:   override bottom page margin (default '22mm')
async function _renderToPDF(html, filePath, options = {}) {
  const { footerTemplate = null, bottomMargin = '22mm' } = options;
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        true,
  });

  let pdfBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const pdfOpts = {
      format:          'A4',
      margin:          { top: '22mm', right: '20mm', bottom: bottomMargin, left: '20mm' },
      printBackground: true,
    };
    if (footerTemplate) {
      pdfOpts.displayHeaderFooter = true;
      pdfOpts.headerTemplate      = '<div></div>';
      pdfOpts.footerTemplate      = footerTemplate;
    }
    pdfBuffer = await page.pdf(pdfOpts);
  } finally {
    await browser.close();
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: options.upsert ?? false });

  if (error) throw new Error(`PDF storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// Returns the Supabase public URL of the uploaded PDF.
async function generateAndUploadPDF({ letter, school, recipientType, letterKind = 'discipline', watermark = false, pathPrefix = 'letters' }) {
  const { resolvedSchool, resolvedExtras } = await resolveImages(school, {
    issued_by_signature_url: letter.issued_by_signature_url,
  });
  const resolvedLetter = { ...letter, ...resolvedExtras };
  const html     = buildLetterHTML({ letter: resolvedLetter, school: resolvedSchool, recipientType, letterKind, watermark });
  const prefix   = watermark ? 'draft' : 'final';
  const filePath = `${pathPrefix}/${prefix}-${Date.now()}.pdf`;
  return _renderToPDF(html, filePath);
}

// ── Admission letter ──────────────────────────────────────────────────────────
// school fields used: name, address, phone, email, motto, letterhead_url,
//   headmaster_signature_url, primary_color, vision, mission,
//   admission_year (2-digit int),
//   admission_letter_template (text|null),
//   admission_reporting_date (text|null)
// application fields used: admission_number, full_name, index_number,
//   admission_type, program_name, house, residential_status, gender, aggregate,
//   guardian_name, guardian_mobile
function buildAdmissionLetterHTML({ application: a, school }) {
  const sigHtml = renderSig(school.headmaster_signature_url);
  const year    = 2000 + (school.admission_year || new Date().getFullYear() % 100);
  const today   = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // Reference number: ADM/{prefix}/{2-digit year}/{sequential part of admission number}
  const admPrefix   = school.admission_prefix || '';
  const yearStr     = String(year).slice(-2);
  const rawSeq      = a.admission_number
    ? a.admission_number.slice(admPrefix.length, admPrefix.length > 0 ? -2 : undefined)
    : '0001';
  const refNumber   = `ADM/${admPrefix}/${yearStr}/${rawSeq}`;

  const fields = {
    name:             a.full_name,
    admissionNo:      a.admission_number,
    indexNumber:      a.index_number || (a.admission_type === 'direct' ? 'N/A (Direct Admission)' : null),
    program:          a.program_name,
    house:            a.house || 'To be assigned',
    residentialStatus: a.residential_status,
    gender:           a.gender,
    aggregate:        a.aggregate != null ? String(a.aggregate) : null,
    date:             today,
    reportingDate:    school.admission_reporting_date || null,
    parentName:       a.guardian_name,
    parentMobile:     a.guardian_mobile,
    schoolName:       school.name,
    academicYear:     `${year}/${year + 1}`,
  };

  const template = school.admission_letter_template || DEFAULT_ADMISSION_LETTER_TEMPLATE;
  const bodyHtml = mergeTemplate(template, fields);

  const watermarkHtml = school.logo_url
    ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                   width:380px;height:380px;display:flex;align-items:center;justify-content:center;
                   pointer-events:none;z-index:0;">
         <img src="${esc(school.logo_url)}" style="width:100%;height:100%;object-fit:contain;opacity:0.07;" />
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(school.name)} — Offer of Admission</title>
  <style>
    @page { margin: 22mm 20mm 28mm 20mm; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #000; line-height: 1.7; max-width: 720px; margin: 0 auto; position: relative; }
    p { margin: 0 0 12px; }
    ul { margin: 0 0 12px; padding-left: 28px; list-style-type: disc; }
    ol { margin: 0 0 12px; padding-left: 28px; list-style-type: decimal; }
    li { margin-bottom: 5px; display: list-item; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    u  { text-decoration: underline; }
    img { max-width: 100%; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  ${watermarkHtml}
  <div style="position:relative;z-index:1;">
    ${renderLetterhead(school)}
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin:0 0 24px;font-size:10.5pt;">
      <div><strong>Ref:</strong> ${esc(refNumber)}</div>
      <div><strong>Date:</strong> ${esc(today)}</div>
    </div>
    <div style="margin-bottom:32px;">${bodyHtml}</div>
    <div style="margin-top:40px;">
      <div style="display:flex;justify-content:flex-end;">
        <div>
          <p style="margin:0 0 4px;">Yours faithfully,</p>
          ${sigHtml}
          <div style="border-top:1px solid #000;width:220px;margin-top:6px;padding-top:8px;">
            <div style="font-weight:bold;font-size:11pt;">${esc(school.headmaster_name || 'The Headmaster')}</div>
            <div style="font-size:10pt;color:#555;">Headmaster</div>
          </div>
        </div>
      </div>
      <div style="margin-top:20px;font-size:11pt;line-height:1.8;">
        ${a.guardian_name   ? `<div style="font-weight:bold;">${esc(a.guardian_name)}</div>` : ''}
        ${a.guardian_mobile ? `<div>Tel: ${esc(a.guardian_mobile)}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function generateAdmissionLetterPDF({ application, school }) {
  const { resolvedSchool } = await resolveImages(school);
  const html         = buildAdmissionLetterHTML({ application, school: resolvedSchool });
  const footerHtml   = buildFooterHtml(resolvedSchool);
  const filePath     = `admissions/letters/letter-${application.id}.pdf`;
  const url = await _renderToPDF(html, filePath, {
    footerTemplate: footerHtml || undefined,
    bottomMargin:   footerHtml ? '34mm' : '22mm',
    upsert:         true,
  });
  return { url, filePath };
}

// ── ID Card ───────────────────────────────────────────────────────────────────
// CR80 dimensions: 85.6 × 54 mm.
// Design language: sleek minimal — vertical color bar, square photo, clean type hierarchy.
// No clip-path, no diagonal shapes, no circular elements.

// FRONT of card — returns an HTML fragment (no doctype/head).
function buildCardMarkup({ student, card, school, qrDataUrl }) {
  const primary = esc(school.primary_color || '#007A8C');
  const accent  = esc(school.accent_color  || '#B8860B');

  function fmtCardDate(d, style) {
    if (!d) return null;
    const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T12:00:00Z' : '')) : new Date(d);
    if (isNaN(dt)) return null;
    return dt.toLocaleDateString('en-GB', style).toUpperCase();
  }

  const expires = fmtCardDate(card.expires_at, { month: 'short', year: 'numeric' }) || 'NO EXPIRY';
  const issued  = fmtCardDate(card.issued_at,  { day: 'numeric', month: 'short', year: 'numeric' });

  const photoContent = student.picture_url
    ? `<img src="${esc(student.picture_url)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<svg viewBox="0 0 60 72" xmlns="http://www.w3.org/2000/svg" style="position:absolute;bottom:0;left:0;width:100%;height:90%;">
         <circle cx="30" cy="20" r="15" fill="rgba(255,255,255,0.22)"/>
         <path d="M0 72 Q0 44 30 44 Q60 44 60 72Z" fill="rgba(255,255,255,0.22)"/>
       </svg>`;

  const logoHtml = school.logo_url
    ? `<img src="${esc(school.logo_url)}" style="width:7mm;height:7mm;object-fit:contain;flex-shrink:0;" />`
    : '';

  const program = student.program_display_name
    || toTitleCase(student.program_name || student.class_name)
    || '—';

  function fieldRow(label, value) {
    return `<div style="display:flex;align-items:baseline;overflow:hidden;line-height:1.3;">
      <span style="font-size:5.5pt;font-weight:900;color:${accent};text-transform:uppercase;letter-spacing:0.07em;flex-shrink:0;width:13mm;">${label}</span>
      <span style="font-size:6pt;color:#1E293B;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(value || '—')}</span>
    </div>`;
  }

  const watermark = school.logo_url
    ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;">
         <img src="${esc(school.logo_url)}" style="width:30mm;height:30mm;object-fit:contain;opacity:0.07;" />
       </div>`
    : '';

  return `<div style="width:85.6mm;height:54mm;display:flex;background:#F7F9FB;overflow:hidden;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;position:relative;">
  ${watermark}

  <!-- Card body -->
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;z-index:1;">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:1.5mm;padding:1.5mm 2mm 0 1.8mm;flex-shrink:0;">
      ${logoHtml}
      <div style="flex:1;color:${primary};font-size:11pt;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(school.name)}</div>
      <div style="text-align:right;flex-shrink:0;line-height:1.35;">
        <div style="font-size:5pt;font-weight:800;color:${accent};letter-spacing:0.09em;text-transform:uppercase;">STUDENT</div>
        <div style="font-size:5pt;font-weight:800;color:${accent};letter-spacing:0.09em;text-transform:uppercase;">ID CARD</div>
      </div>
    </div>

    <!-- Hairline (2px — thicker than student-name rule for hierarchy) -->
    <div style="height:2px;background:${accent};margin:1.2mm 2mm;flex-shrink:0;opacity:0.75;"></div>

    <!-- Main body -->
    <div style="flex:1;display:flex;padding:0 1.8mm 0 1.5mm;gap:2mm;overflow:hidden;min-height:0;">

      <!-- Photo -->
      <div style="width:21mm;flex-shrink:0;align-self:flex-start;background:${primary};overflow:hidden;position:relative;">
        <div style="width:21mm;height:27mm;overflow:hidden;position:relative;">${photoContent}</div>
      </div>

      <!-- Info column -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;">

        <!-- Student name -->
        <div style="font-size:8.5pt;font-weight:900;color:${primary};text-transform:uppercase;letter-spacing:0.02em;line-height:1.2;margin-bottom:1mm;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(student.name)}</div>

        <!-- Rule (1px — intentionally thinner than the header hairline) -->
        <div style="height:1px;background:${accent};margin-bottom:1.4mm;flex-shrink:0;opacity:0.75;"></div>

        <!-- Fields + QR -->
        <div style="flex:1;display:flex;gap:1.5mm;overflow:hidden;min-height:0;">
          <div style="flex:1;display:flex;flex-direction:column;gap:1.5mm;overflow:hidden;min-width:0;">
            ${fieldRow('SEX',     student.gender)}
            ${fieldRow('PROG',    program)}
            ${fieldRow('STATUS',  student.residential_status)}
            ${fieldRow('HOUSE',   student.house)}
            ${issued ? fieldRow('ISSUED',  issued) : ''}
          </div>
          <!-- QR -->
          <div style="display:flex;align-items:flex-end;flex-shrink:0;padding-bottom:0.5mm;">
            <div style="background:white;border:0.3mm solid #CBD5E1;padding:0.5mm;">
              <img src="${qrDataUrl}" style="display:block;width:12mm;height:12mm;" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="height:11mm;background:${primary};display:flex;align-items:center;justify-content:space-between;padding:0 2.5mm;flex-shrink:0;">
      <div style="color:white;font-size:7pt;font-weight:800;letter-spacing:0.03em;">ID: ${esc(student.student_code || '—')}</div>
      <div style="text-align:right;">
        <div style="color:rgba(255,255,255,0.65);font-size:5pt;font-weight:600;letter-spacing:0.09em;text-transform:uppercase;">Valid Thru</div>
        <div style="color:white;font-size:6.5pt;font-weight:800;letter-spacing:0.03em;">${expires}</div>
      </div>
    </div>
  </div>
</div>`;
}

// BACK of card — returns an HTML fragment (no doctype/head).
function buildCardBackMarkup({ student, card, school }) {
  const primary = esc(school.primary_color || '#007A8C');
  const accent  = esc(school.accent_color  || '#B8860B');

  const logoHtml = school.logo_url
    ? `<img src="${esc(school.logo_url)}" style="width:7mm;height:7mm;object-fit:contain;flex-shrink:0;" />`
    : '';

  const sigHtml = school.headmaster_signature_url
    ? `<img src="${esc(school.headmaster_signature_url)}" style="display:block;max-height:5.5mm;max-width:18mm;object-fit:contain;" />`
    : `<div style="height:5.5mm;"></div>`;

  const vision  = (school.vision      || '').trim();
  const mission = (school.mission     || '').trim();
  const values  = (school.core_values || '').trim();
  const c1      = (school.lost_card_contact_1 || '').trim();
  const c2      = (school.lost_card_contact_2 || '').trim();
  const hdmName = (school.headmaster_name || 'Headmaster').trim();

  const contactLine = c1 && c2
    ? `If found, contact ${esc(c1)} or ${esc(c2)}`
    : c1 ? `If found, contact ${esc(c1)}` : '';

  // Each block takes its natural height; space-between distributes remaining
  // space evenly between them — no proportional flex that creates uneven gaps.
  function infoBlock(label, text, maxLines) {
    if (!text) return '';
    return `<div style="overflow:hidden;">
      <div style="display:flex;align-items:center;gap:1mm;margin-bottom:0.5mm;">
        <div style="width:2.5mm;height:1.5px;background:${accent};border-radius:1px;flex-shrink:0;"></div>
        <div style="font-size:4.5pt;font-weight:900;color:${accent};text-transform:uppercase;letter-spacing:0.1em;line-height:1;">${label}</div>
      </div>
      <div style="font-size:5pt;color:#334155;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:${maxLines};-webkit-box-orient:vertical;padding-left:3.5mm;">${esc(text)}</div>
    </div>`;
  }

  return `<div style="width:85.6mm;height:54mm;display:flex;background:#FFFFFF;overflow:hidden;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;">
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">

    <!-- Top strip -->
    <div style="height:10mm;background:${accent};display:flex;align-items:center;padding:0 2.5mm;gap:1.5mm;flex-shrink:0;">
      ${logoHtml}
      <div style="flex:1;overflow:hidden;">
        <div style="color:rgba(255,255,255,0.75);font-size:4pt;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:0.5mm;line-height:1;">THIS CARD IS THE PROPERTY OF</div>
        <div style="color:#FFFFFF;font-size:10pt;font-weight:900;text-transform:uppercase;letter-spacing:0.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(school.name)}</div>
      </div>
    </div>

    <!-- Hairline -->
    <div style="height:1.5px;background:${primary};flex-shrink:0;opacity:0.2;"></div>

    <!-- Body: space-between distributes identical gaps between the 4 rows -->
    <div style="flex:1;padding:1.8mm 2.5mm 1.2mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;min-height:0;">
      ${infoBlock('Vision', vision, 2)}
      ${infoBlock('Mission', mission, 3)}
      ${infoBlock('Values', values, 2)}
      ${contactLine
        ? `<div style="display:flex;align-items:center;gap:1mm;overflow:hidden;">
             <div style="width:2.5mm;height:1.5px;background:#CBD5E1;flex-shrink:0;"></div>
             <div style="font-size:4pt;color:#94A3B8;font-style:italic;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${contactLine}</div>
           </div>`
        : '<div></div>'}
    </div>

    <!-- Footer -->
    <div style="height:10mm;background:${primary};display:flex;align-items:center;justify-content:space-between;padding:0 2.5mm;flex-shrink:0;overflow:hidden;">
      <div style="display:flex;flex-direction:column;justify-content:flex-end;gap:0.7mm;overflow:hidden;min-width:0;height:100%;padding-bottom:1.2mm;">
        ${sigHtml}
        <div style="width:22mm;height:0.3mm;background:rgba(255,255,255,0.45);flex-shrink:0;"></div>
        <div style="color:rgba(255,255,255,0.9);font-size:5pt;font-weight:600;letter-spacing:0.04em;white-space:nowrap;">${esc(hdmName)}</div>
      </div>
      <!-- Concentric arc decoration -->
      <div style="display:flex;align-items:center;gap:1mm;flex-shrink:0;">
        <div style="width:2mm;height:2mm;border-radius:50%;background:rgba(255,255,255,0.18);"></div>
        <div style="width:3.5mm;height:3.5mm;border-radius:50%;background:rgba(255,255,255,0.30);"></div>
        <div style="width:5.5mm;height:5.5mm;border-radius:50%;background:rgba(255,255,255,0.45);"></div>
      </div>
    </div>
  </div>
</div>`;
}

// Wraps front + back in a 2-page CR80 PDF document.
// Page 1: front of card  Page 2: back of card
function buildCardHTML({ student, card, school, qrDataUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 85.6mm; background: #fff; }
  .face { width: 85.6mm; height: 54mm; overflow: hidden; page-break-after: always; }
  .face:last-child { page-break-after: auto; }
</style>
</head>
<body>
<div class="face">${buildCardMarkup({ student, card, school, qrDataUrl })}</div>
<div class="face">${buildCardBackMarkup({ student, card, school })}</div>
</body>
</html>`;
}

// Resolve a Chromium/Chrome executable.
// @sparticuz/chromium provides a Linux ELF binary (for AWS Lambda) — it exists
// on disk on Windows but cannot be spawned. Skip it on non-Linux platforms.
async function resolveChromePath() {
  const fs = require('fs');

  if (process.platform !== 'linux') {
    // Windows / macOS local dev — use installed Chrome directly.
    const localCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
    for (const p of localCandidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error('No Chrome found. Install Google Chrome for local PDF generation.');
  }

  // Linux (production / Lambda): use @sparticuz/chromium then fall back to system.
  try {
    const p = await chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch { /* fall through */ }

  const linuxCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  for (const p of linuxCandidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chrome/Chromium found on Linux. Install chromium-browser or set up @sparticuz/chromium.');
}

// Generates a 2-page CR80 PDF buffer (front page 1, back page 2).
// Does NOT upload to Supabase — caller streams the buffer directly.
async function generateCardBuffer({ student, card, school }) {
  const qrDataUrl = await QRCode.toDataURL(card.token, {
    errorCorrectionLevel: 'M',
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  const html            = buildCardHTML({ student, card, school, qrDataUrl });
  const executablePath  = await resolveChromePath();
  const browser         = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: null,
    executablePath,
    headless:        true,
  });

  let pdfBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Let @page { size: 85.6mm 54mm } govern; do not pass width/height here
    // so Puppeteer produces a 2-page PDF (front + back).
    // Buffer.from(...): puppeteer-core 25.x's page.pdf() returns a plain
    // Uint8Array, not a Node Buffer (confirmed directly — Buffer.isBuffer()
    // is false on the raw result) — res.send() on a Uint8Array doesn't
    // recognize it as binary and JSON-serializes it byte-by-byte instead of
    // sending the actual PDF/PNG bytes. Every Puppeteer output in this file
    // gets wrapped the same way, at the point it's captured, rather than
    // leaving it to each caller to remember.
    pdfBuffer = Buffer.from(await page.pdf({
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    }));
  } finally {
    await browser.close();
  }

  return pdfBuffer;
}

// ── Batch card tiling ─────────────────────────────────────────────────────────
// Produces duplex-ready A4 sheets: for each chunk of 8 cards a FRONT sheet
// followed immediately by a BACK sheet.
//
// Long-edge duplex flip: in a 2-column portrait layout the back sheet must
// mirror columns per row so card backs align with their fronts when flipped.
// Given front positions [0,1, 2,3, 4,5, 6,7] (left/right per row),
// the back DOM order is    [1,0, 3,2, 5,4, 7,6] — swap pairs within each row.
function buildBatchHTML(entries) {
  const sheetPairs = [];

  for (let i = 0; i < entries.length; i += 8) {
    const chunk = entries.slice(i, i + 8);

    // Front sheet: natural order
    const frontSlots = chunk.map(e =>
      `<div class="crop-slot">${buildCardMarkup(e)}</div>`
    ).join('\n  ');

    // Back sheet: swap pairs within each row for long-edge flip
    const backOrder = [];
    for (let r = 0; r < chunk.length; r += 2) {
      backOrder.push(r + 1 < chunk.length ? chunk[r + 1] : null);
      backOrder.push(chunk[r]);
    }
    const backSlots = backOrder.map(e =>
      e
        ? `<div class="crop-slot">${buildCardBackMarkup(e)}</div>`
        : `<div class="crop-slot empty"></div>`
    ).join('\n  ');

    sheetPairs.push(
      `<div class="sheet">\n  ${frontSlots}\n</div>`,
      `<div class="sheet back">\n  ${backSlots}\n</div>`
    );
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 210mm; background: #fff; }
  .sheet {
    width: 210mm;
    height: 297mm;
    display: grid;
    grid-template-columns: 85.6mm 85.6mm;
    grid-template-rows: repeat(4, 54mm);
    gap: 4mm;
    justify-content: center;
    align-content: center;
    page-break-after: always;
    overflow: hidden;
  }
  .sheet:last-child { page-break-after: auto; }
  .crop-slot {
    width: 85.6mm;
    height: 54mm;
    position: relative;
    overflow: hidden;
    box-shadow: 0 0 0 0.3mm rgba(140,140,140,0.45);
  }
  .crop-slot.empty { background: #fafafa; }
</style>
</head>
<body>
${sheetPairs.join('\n')}
</body>
</html>`;
}

// Generates a multi-page A4 batch PDF, uploads to Supabase, returns public URL.
// entries: [{ student, card, school, qrDataUrl }]  (qrDataUrl already resolved)
async function generateBatchAndUpload({ entries, schoolId }) {
  const html            = buildBatchHTML(entries);
  const executablePath  = await resolveChromePath();
  const browser         = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: null,
    executablePath,
    headless:        true,
  });

  let pdfBuffer;
  try {
    const page = await browser.newPage();
    // 'load' fires when all resources (including images) have been fetched —
    // correct for PDF generation. 'networkidle2' can stall for minutes when
    // many external photos are in the document. Timeout is generous for large
    // whole-school batches (87+ A4 pages on slow hardware).
    await page.setContent(html, { waitUntil: 'load', timeout: 300000 });
    // Buffer.from(...): see the matching comment on generateCardBuffer —
    // page.pdf() returns a Uint8Array, not a Node Buffer, on this
    // puppeteer-core version.
    pdfBuffer = Buffer.from(await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    }));
  } finally {
    await browser.close();
  }

  const filePath = `id-cards/batch-${schoolId}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (error) throw new Error(`Batch PDF upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// Generates a PNG screenshot of the card front only (648×408 px at 2× DPR).
async function generateCardPng({ student, card, school }) {
  const qrDataUrl = await QRCode.toDataURL(card.token, {
    errorCorrectionLevel: 'M',
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 85.6mm; height: 54mm; background: #fff; overflow: hidden; }
</style>
</head>
<body>${buildCardMarkup({ student, card, school, qrDataUrl })}</body>
</html>`;

  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: { width: 324, height: 204, deviceScaleFactor: 2 },
    executablePath,
    headless:        true,
  });

  let pngBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Buffer.from(...): see generateCardBuffer's comment — page.screenshot()
    // returns a Uint8Array on this puppeteer-core version, not a Buffer.
    pngBuffer = Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 324, height: 204 } }));
  } finally {
    await browser.close();
  }

  return pngBuffer;
}

// ── WAEC Results Analysis Report ───────────────────────────────────────────────
// Styled with the CAS brand palette (see the design-rules memory): deep
// forest green #0B3D2E for header bands, warm gold #C8973A for section
// accents/dividers, and the brand-calibrated status trio (not Tailwind
// defaults) for % Pass — green #2D7A4F / amber #C8780A / red #B83232,
// applied only to the Total % Pass column so color stays a real
// performance signal rather than decoration on every cell. The Excel
// export (examAnalysisWorkbook.js) mirrors this exact palette and layout.

const WAEC_GRADE_ORDER = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
const EXAM_BRAND_DARK  = '#0B3D2E';
const EXAM_BRAND_MID   = '#145C44';
const EXAM_BRAND_GOLD  = '#C8973A';
const EXAM_GOLD_TINT   = '#F6E9CF';
const EXAM_ZEBRA       = '#FAF7F1';
const EXAM_BORDER      = '#D9D2C4';
const EXAM_STATUS_GOOD = '#2D7A4F';
const EXAM_STATUS_WARN = '#C8780A';
const EXAM_STATUS_BAD  = '#B83232';
const EXAM_MUTED       = '#6B6358';

function examPassRateColor(pct) {
  if (pct >= 75) return EXAM_STATUS_GOOD;
  if (pct >= 50) return EXAM_STATUS_WARN;
  return EXAM_STATUS_BAD;
}

function buildExamAnalysisReportHTML(report, school, { includeChart = false } = {}) {
  const colCount = 1 + 3 * 3 + WAEC_GRADE_ORDER.length * 3 + 3;

  const subjectRow = (s, zebra) => {
    const gradeCells = WAEC_GRADE_ORDER.map(g => {
      const d = s.gradeDistribution[g];
      return `<td class="num">${d?.boys || ''}</td><td class="num">${d?.girls || ''}</td><td class="num">${d ? d.boys + d.girls : ''}</td>`;
    }).join('');
    return `<tr${zebra ? ' class="zebra"' : ''}>
      <td class="subject-name">${esc(s.name)}</td>
      <td class="num">${s.registered.boys}</td><td class="num">${s.registered.girls}</td><td class="num">${s.registered.total}</td>
      <td class="num">${s.presented.boys}</td><td class="num">${s.presented.girls}</td><td class="num">${s.presented.total}</td>
      <td class="num">${s.absent.boys}</td><td class="num">${s.absent.girls}</td><td class="num">${s.absent.total}</td>
      ${gradeCells}
      <td class="num">${s.percentagePass.boys}%</td><td class="num">${s.percentagePass.girls}%</td>
      <td class="num pct-total" style="color:${examPassRateColor(s.percentagePass.total)}">${s.percentagePass.total}%</td>
    </tr>`;
  };

  const coreSubjects = report.subjects.filter(s => s.isCore);
  const electiveSubjects = report.subjects.filter(s => !s.isCore);
  let zebraIndex = 0;
  const sectionHTML = (title, subjects) => {
    if (!subjects.length) return '';
    const rows = subjects.map(s => subjectRow(s, zebraIndex++ % 2 === 1)).join('');
    return `<tr><td class="section-band" colspan="${colCount}">${esc(title)}</td></tr>${rows}`;
  };

  const summaryCard = (title, rows) => `
    <div class="card">
      <div class="card-title">${esc(title)}</div>
      <table class="card-table">
        ${rows.map(([label, value], i) => `<tr${i % 2 === 1 ? ' class="zebra"' : ''}><td>${esc(label)}</td><td class="num">${value}</td></tr>`).join('')}
      </table>
    </div>`;

  const maxBucket = Math.max(0, ...Object.keys(report.summaryOfPasses.buckets).map(Number));
  const computedRows = [['Total Number of Candidates', report.totalCandidates]];
  for (let n = maxBucket; n >= 1; n--) computedRows.push([`${n} Pass${n === 1 ? '' : 'es'}`, report.summaryOfPasses.buckets[n] || 0]);
  computedRows.push(['Failures', report.summaryOfPasses.failures]);
  computedRows.push(['No Result (Absent / Cancelled / Withheld)', report.summaryOfPasses.noResultCandidates]);

  let officialCardHTML = '';
  if (report.officialSummary) {
    const os = report.officialSummary;
    const osMaxBucket = Math.max(0, ...Object.keys(os.buckets || {}).map(Number));
    const officialRows = [['Total Number of Candidates', os.totalCandidates]];
    for (let n = osMaxBucket; n >= 1; n--) officialRows.push([`${n} Pass${n === 1 ? '' : 'es'}`, os.buckets[n] || 0]);
    officialRows.push(['Failures', os.failures ?? 0]);
    officialRows.push(['Absent', os.absent ?? 0]);
    officialRows.push(['Entire Results Withheld', os.entireResultsWithheld ?? 0]);
    officialRows.push(['Entire Results Pending', os.entireResultsPending ?? 0]);
    officialRows.push(['Candidate Owing Fees', os.candidateOwingFees ?? 0]);
    officialRows.push(['Entire Results Blocked', os.entireResultsBlocked ?? 0]);
    officialRows.push(['Entire Results Cancelled', os.entireResultsCancelled ?? 0]);
    officialCardHTML = summaryCard("WAEC's Own Printed Summary", officialRows);
  }

  const mismatchHTML = (report.summaryMismatches && report.summaryMismatches.length)
    ? `<div class="mismatch-note">${report.summaryMismatches.map(m => esc(m)).join(' ')}</div>`
    : '';

  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
    * { box-sizing: border-box; }
    html, body { background: #FFFFFF; }
    body { font-family: Arial, Helvetica, sans-serif; color: #2A2620; margin: 0; }
    table { border-collapse: collapse; width: 100%; }

    .letterhead { text-align: center; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 3px solid ${EXAM_BRAND_GOLD}; }
    .letterhead h1 { margin: 0 0 4px; font-size: 16pt; color: ${EXAM_BRAND_DARK}; }
    .letterhead h2 { margin: 0; font-size: 11pt; font-weight: normal; color: ${EXAM_BRAND_MID}; }
    .letterhead .meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 8pt; color: ${EXAM_MUTED}; }

    table.report th, table.report td { border: 1px solid ${EXAM_BORDER}; padding: 3px 5px; font-size: 7.5pt; background: #FFFFFF; }
    table.report thead th { background: ${EXAM_BRAND_DARK}; color: #fff; font-weight: bold; text-align: center; }
    table.report .subject-name { text-align: left; white-space: nowrap; }
    table.report .num { text-align: center; }
    table.report .pct-total { font-weight: bold; }
    table.report tr.zebra td { background: ${EXAM_ZEBRA}; }
    table.report .section-band { background: ${EXAM_GOLD_TINT}; color: ${EXAM_BRAND_DARK}; font-weight: bold; text-align: left; padding: 4px 6px; }

    .summary-section { display: flex; gap: 20px; margin-top: 22px; align-items: flex-start; }
    .card { border: 1px solid ${EXAM_BORDER}; border-radius: 8px; overflow: hidden; width: 320px; background: #FFFFFF; }
    .card-title { background: ${EXAM_BRAND_DARK}; color: #fff; font-weight: bold; font-size: 9pt; padding: 6px 10px; }
    .card-table td { padding: 3px 10px; font-size: 8pt; border: none; border-bottom: 1px solid ${EXAM_BORDER}; background: #FFFFFF; }
    .card-table tr:last-child td { border-bottom: none; }
    .card-table tr.zebra td { background: ${EXAM_ZEBRA}; }
    .card-table .num { text-align: right; font-weight: bold; }

    .mismatch-note { margin-top: 14px; padding: 8px 12px; border-left: 3px solid ${EXAM_STATUS_WARN}; background: ${EXAM_GOLD_TINT}; font-size: 8pt; color: #4A3F32; font-style: italic; }
    .chart-wrap { margin: 10px 0 18px; text-align: center; }
  </style></head><body>
    <div class="letterhead">
      <h1>${esc(school.name)}</h1>
      <h2>${esc(report.examBody)} ${report.year} School Result Analysis</h2>
      <div class="meta">
        <span>${report.schoolNumber ? `School # ${esc(report.schoolNumber)}` : ''}</span>
        <span>Generated ${generatedOn}</span>
      </div>
    </div>

    ${includeChart ? `<div class="chart-wrap">${renderSubjectPassRateChartSVG(report.subjects, { width: 1000, height: 340 })}</div>` : ''}

    <table class="report">
      <thead>
        <tr>
          <th rowspan="2">Subject</th>
          <th colspan="3">Registered</th>
          <th colspan="3">Presented</th>
          <th colspan="3">Absent</th>
          ${WAEC_GRADE_ORDER.map(g => `<th colspan="3">${g}</th>`).join('')}
          <th colspan="3">% Pass</th>
        </tr>
        <tr>
          ${Array.from({ length: 3 + 3 + 3 + WAEC_GRADE_ORDER.length * 3 + 3 }).map((_, i) => `<th>${['B', 'G', 'T'][i % 3]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${sectionHTML('Core Subjects', coreSubjects)}
        ${sectionHTML('Elective Subjects', electiveSubjects)}
      </tbody>
    </table>

    <div class="summary-section">
      ${summaryCard('Summary of Subjects Passed (computed)', computedRows)}
      ${officialCardHTML}
    </div>
    ${mismatchHTML}
  </body></html>`;
}

// Returns a PDF buffer directly (no Supabase upload) — the report is
// always computed live and re-exportable on demand, so persisting every
// export attempt to storage would just accumulate orphaned files.
async function generateExamAnalysisReportPDFBuffer(report, school, { includeChart = false } = {}) {
  const html = buildExamAnalysisReportHTML(report, school, { includeChart });
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Buffer.from(...): see generateCardBuffer's comment — page.pdf()
    // returns a Uint8Array on this puppeteer-core version, not a Buffer.
    return Buffer.from(await page.pdf({
      format: 'A3', landscape: true, printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '14mm', left: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:7pt;color:${EXAM_MUTED};display:flex;justify-content:space-between;padding:0 10mm;">
        <span>CAS Services</span><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    }));
  } finally {
    await browser.close();
  }
}

// PNG screenshot of the same SVG chart — used to embed it as a real image
// in the Excel export (ExcelJS has no native chart object, only
// worksheet.addImage; see services/publicWaecExport.service.js).
async function generateChartPngBuffer(subjects, { width = 820, height = 380 } = {}) {
  const svg = renderSubjectPassRateChartSVG(subjects, { width, height });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>* { margin: 0; padding: 0; } body { background: #fff; }</style></head><body>${svg}</body></html>`;
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: { width, height, deviceScaleFactor: 2 },
    executablePath,
    headless:        true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    // Buffer.from(...): see generateCardBuffer's comment — page.screenshot()
    // returns a Uint8Array on this puppeteer-core version, not a Buffer.
    return Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } }));
  } finally {
    await browser.close();
  }
}

// ── Board Report ──────────────────────────────────────────────────────────

// Splits the AI's plain-text output into sections on its own ALL-CAPS
// header lines (the system prompt instructs it to write exactly these, with
// no markdown) — a header line is short, non-empty, and contains no
// lowercase letters.
function splitReportIntoSections(reportText) {
  const lines = (reportText || '').split('\n');
  const isHeaderLine = (line) => {
    const t = line.trim();
    if (!t || t.length > 70) return false;
    return /[A-Z]/.test(t) && !/[a-z]/.test(t) && /^[A-Z0-9 &\-,']+$/.test(t);
  };
  const sections = [];
  let current = { header: null, body: [] };
  for (const line of lines) {
    if (isHeaderLine(line)) {
      if (current.header || current.body.some(l => l.trim())) sections.push(current);
      current = { header: line.trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.header || current.body.some(l => l.trim())) sections.push(current);
  return sections;
}

// Maps a parsed section header back to the one facts sub-object it narrates,
// so the Key Figures table under it is never AI-transcribed — same figures
// the prompt itself was grounded on.
function factsForSectionHeader(header, facts) {
  if (/ACADEM|RESULT/i.test(header)) return { label: 'Academic Performance', data: { ...facts.academics, by_class: undefined, by_subject: undefined, result_entry: undefined } };
  if (/ATTEND/i.test(header)) return { label: 'Attendance', data: { staff: facts.attendance?.staff, students: facts.attendance?.students } };
  if (/DISCIPLIN|CONDUCT/i.test(header)) return { label: 'Discipline', data: facts.discipline };
  if (/EXEAT/i.test(header)) return { label: 'Exeat', data: facts.exeat };
  if (/CLINIC|HEALTH/i.test(header)) return { label: 'Clinic', data: { ...facts.clinic, by_severity: undefined, by_outcome: undefined, by_patient_type: undefined } };
  if (/FINANC|FEE|BUDGET/i.test(header)) return { label: 'Finance', data: facts.finance };
  if (/ENROL/i.test(header)) return { label: 'Enrollment', data: { total_active_students: facts.enrollment?.total_active_students } };
  return null;
}

// Flattens one level of nested objects into "parent child" labels; arrays
// are skipped (the AI narrative already covers them — this table is a
// compact numeric appendix, not a full data dump).
function flattenFacts(obj, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v == null || Array.isArray(v)) continue;
    const label = prefix ? `${prefix} ${k}` : k;
    if (typeof v === 'object') { out.push(...flattenFacts(v, label)); continue; }
    out.push([label.replace(/_/g, ' '), v]);
  }
  return out;
}

function buildBoardReportHTML(reportText, facts, school) {
  const sections = splitReportIntoSections(reportText);
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const sectionHTML = sections.map(s => {
    const paragraphs = s.body.join('\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const bodyHTML = paragraphs.map(p => `<p style="margin:0 0 10px;">${esc(p).replace(/\n/g, '<br/>')}</p>`).join('');
    const figures = s.header ? factsForSectionHeader(s.header, facts) : null;
    const rows = figures ? flattenFacts(figures.data) : [];
    const figuresHTML = rows.length
      ? `<table class="figures"><tr><td colspan="2" class="figures-title">${esc(figures.label)} — Key Figures</td></tr>
         ${rows.map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num">${esc(String(value))}</td></tr>`).join('')}
         </table>`
      : '';
    return `<div class="section">
      ${s.header ? `<h3>${esc(s.header)}</h3>` : ''}
      ${bodyHTML}
      ${figuresHTML}
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
    * { box-sizing: border-box; }
    html, body { background: #FFFFFF; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #2A2620; line-height: 1.6; margin: 0; }
    .meta-bar { display: flex; justify-content: space-between; font-size: 8pt; color: #7A7266; margin-bottom: 18px; font-family: Arial, Helvetica, sans-serif; }
    .section { margin-bottom: 20px; page-break-inside: avoid; }
    .section h3 { font-size: 11.5pt; letter-spacing: 0.03em; color: #0B3D2E; border-bottom: 1.5px solid #0B3D2E; padding-bottom: 4px; margin: 0 0 10px; font-family: Arial, Helvetica, sans-serif; }
    table.figures { width: 100%; border-collapse: collapse; margin-top: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
    table.figures td { border: 1px solid #DDD6C8; padding: 3px 8px; }
    table.figures .figures-title { background: #F4EFE3; font-weight: bold; color: #0B3D2E; }
    table.figures .num { text-align: right; font-weight: bold; width: 110px; }
  </style></head><body>
    ${renderLetterhead(school)}
    <div class="meta-bar">
      <span>Board Report — ${esc(facts?.period?.period_label ?? '')}</span>
      <span>Generated ${generatedOn}</span>
    </div>
    ${sectionHTML}
  </body></html>`;
}

// Returns a PDF buffer directly (no Supabase upload) — same rationale as
// generateExamAnalysisReportPDFBuffer: the report is always computed live
// and re-exportable on demand, so persisting every export attempt to
// storage would just accumulate orphaned files.
async function generateBoardReportPDFBuffer(reportText, facts, school) {
  const html = buildBoardReportHTML(reportText, facts, school);
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    return Buffer.from(await page.pdf({
      format: 'A4', landscape: false, printBackground: true,
      margin: { top: '18mm', right: '18mm', bottom: '16mm', left: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:7pt;color:#7A7266;display:flex;justify-content:space-between;padding:0 18mm;font-family:Arial,Helvetica,sans-serif;">
        <span>CAS Services</span><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    }));
  } finally {
    await browser.close();
  }
}

const SCORE_LABELS = { 1: '1 — Ineffective', 2: '2 — Developing', 3: '3 — Effective', 4: '4 — Highly Effective' };

function buildObservationReportHTML(observation, scores, actions, photos, school) {
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const observedOn = observation.observed_at
    ? new Date(observation.observed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const scoreRows = scores.map(s => `
    <tr>
      <td>${esc(s.criterion_name)}</td>
      <td style="text-align:center;white-space:nowrap;">${s.score ? esc(SCORE_LABELS[s.score]) : 'Not Observed'}</td>
      <td>${esc(s.note || '')}</td>
    </tr>`).join('');

  const actionRows = actions.length ? `
    <div class="section">
      <h3>Follow-Up Action Items</h3>
      <table class="figures">
        <tr><td class="figures-title">Description</td><td class="figures-title">Due</td><td class="figures-title">Status</td></tr>
        ${actions.map(a => `<tr><td>${esc(a.description)}</td><td>${a.due_date ? esc(a.due_date) : '—'}</td><td>${esc(a.status)}</td></tr>`).join('')}
      </table>
    </div>` : '';

  const photoBlock = photos.length ? `
    <div class="section">
      <h3>Evidence Photos</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${photos.map(p => `<img src="${esc(p.photo_url)}" style="width:150px;height:112px;object-fit:cover;border:1px solid #DDD6C8;border-radius:4px;" />`).join('')}
      </div>
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
    * { box-sizing: border-box; }
    html, body { background: #FFFFFF; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #2A2620; line-height: 1.6; margin: 0; }
    .meta-bar { display: flex; justify-content: space-between; font-size: 8pt; color: #7A7266; margin-bottom: 18px; font-family: Arial, Helvetica, sans-serif; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 9.5pt; font-family: Arial, Helvetica, sans-serif; margin-bottom: 18px; }
    .meta-grid span.lbl { color: #7A7266; }
    .section { margin-bottom: 20px; page-break-inside: avoid; }
    .section h3 { font-size: 11.5pt; letter-spacing: 0.03em; color: #0B3D2E; border-bottom: 1.5px solid #0B3D2E; padding-bottom: 4px; margin: 0 0 10px; font-family: Arial, Helvetica, sans-serif; }
    .section p { margin: 0 0 8px; }
    table.scores, table.figures { width: 100%; border-collapse: collapse; margin-top: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; }
    table.scores td, table.figures td { border: 1px solid #DDD6C8; padding: 5px 8px; vertical-align: top; }
    table.figures .figures-title { background: #F4EFE3; font-weight: bold; color: #0B3D2E; }
  </style></head><body>
    ${renderLetterhead(school)}
    <div class="meta-bar">
      <span>Lesson Observation Report</span>
      <span>Generated ${generatedOn}</span>
    </div>
    <div class="meta-grid">
      <div><span class="lbl">Teacher:</span> ${esc(observation.observed_teacher_name)}</div>
      <div><span class="lbl">Observer:</span> ${esc(observation.observer_name)}</div>
      <div><span class="lbl">Subject / Class:</span> ${esc(observation.subject || '—')} ${observation.class_names ? `(${esc(observation.class_names)})` : ''}</div>
      <div><span class="lbl">Observed on:</span> ${esc(observedOn)}</div>
      <div><span class="lbl">Type:</span> ${observation.observation_type === 'drop_in' ? 'Drop-in' : 'Scheduled'}</div>
      <div><span class="lbl">Entry mode:</span> ${observation.entry_mode === 'paper_entered_later' ? 'Entered from paper form' : 'Live'}</div>
    </div>
    <div class="section">
      <h3>Rubric Scores</h3>
      <table class="scores">
        <tr><td style="font-weight:bold;">Criterion</td><td style="font-weight:bold;text-align:center;">Rating</td><td style="font-weight:bold;">Note</td></tr>
        ${scoreRows}
      </table>
    </div>
    <div class="section">
      <h3>What Went Well</h3>
      <p>${esc(observation.glow_notes || '—').replace(/\n/g, '<br/>')}</p>
    </div>
    <div class="section">
      <h3>What to Work On</h3>
      <p>${esc(observation.grow_notes || '—').replace(/\n/g, '<br/>')}</p>
    </div>
    <div class="section">
      <h3>Recommended Action</h3>
      <p>${esc(observation.recommended_action || '—').replace(/\n/g, '<br/>')}</p>
    </div>
    ${actionRows}
    ${photoBlock}
  </body></html>`;
}

async function generateObservationReportPDFBuffer(observation, scores, actions, photos, school) {
  const html = buildObservationReportHTML(observation, scores, actions, photos, school);
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    return Buffer.from(await page.pdf({
      format: 'A4', landscape: false, printBackground: true,
      margin: { top: '18mm', right: '18mm', bottom: '16mm', left: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:7pt;color:#7A7266;display:flex;justify-content:space-between;padding:0 18mm;font-family:Arial,Helvetica,sans-serif;">
        <span>CAS Services</span><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    }));
  } finally {
    await browser.close();
  }
}

// Blank, printable form for offline/paper observation (§3c of the design doc) —
// no connectivity needed; the observer transcribes it back into the app later.
function buildBlankObservationFormHTML(criteria, school) {
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const criteriaRows = criteria.map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td style="width:70px;"></td>
      <td></td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
    * { box-sizing: border-box; }
    html, body { background: #FFFFFF; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #2A2620; line-height: 1.5; margin: 0; }
    .meta-bar { font-size: 8pt; color: #7A7266; margin-bottom: 18px; }
    .field-row { display: flex; gap: 24px; margin-bottom: 10px; }
    .field { flex: 1; border-bottom: 1px solid #000; padding-bottom: 2px; }
    .field .lbl { font-size: 8pt; color: #7A7266; display: block; }
    .section { margin-bottom: 18px; page-break-inside: avoid; }
    .section h3 { font-size: 11pt; letter-spacing: 0.03em; color: #0B3D2E; border-bottom: 1.5px solid #0B3D2E; padding-bottom: 4px; margin: 0 0 10px; }
    table.scores { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9pt; }
    table.scores td, table.scores th { border: 1px solid #000; padding: 8px; vertical-align: top; }
    table.scores th { background: #F4EFE3; text-align: left; }
    .scale { font-size: 8.5pt; color: #4A3F32; margin-bottom: 10px; }
    .lines { border-bottom: 1px solid #999; height: 20px; }
  </style></head><body>
    ${renderLetterhead(school)}
    <div class="meta-bar">Lesson Observation Form (Blank) — Generated ${generatedOn}. Fill by hand; transcribe into the app once online.</div>
    <div class="field-row">
      <div class="field"><span class="lbl">Teacher</span>&nbsp;</div>
      <div class="field"><span class="lbl">Observer</span>&nbsp;</div>
    </div>
    <div class="field-row">
      <div class="field"><span class="lbl">Subject / Class</span>&nbsp;</div>
      <div class="field"><span class="lbl">Date / Time</span>&nbsp;</div>
    </div>
    <div class="section">
      <h3>Rubric Scores</h3>
      <p class="scale">Scale: 4 = Highly Effective · 3 = Effective · 2 = Developing · 1 = Ineffective · N/A = Not Observed</p>
      <table class="scores">
        <tr><th>Criterion</th><th>Score</th><th>Notes</th></tr>
        ${criteriaRows}
      </table>
    </div>
    <div class="section"><h3>What Went Well</h3><div class="lines"></div><div class="lines"></div></div>
    <div class="section"><h3>What to Work On</h3><div class="lines"></div><div class="lines"></div></div>
    <div class="section"><h3>Recommended Action</h3><div class="lines"></div><div class="lines"></div></div>
  </body></html>`;
}

async function generateBlankObservationFormPDFBuffer(criteria, school) {
  const html = buildBlankObservationFormHTML(criteria, school);
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    return Buffer.from(await page.pdf({
      format: 'A4', landscape: false, printBackground: true,
      margin: { top: '18mm', right: '18mm', bottom: '16mm', left: '18mm' },
    }));
  } finally {
    await browser.close();
  }
}

function buildBudgetReportHTML(budget, items, school) {
  const generatedOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const money = n => n == null ? '—' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = items.reduce((sum, i) => sum + (i.amount != null ? Number(i.amount) : 0), 0);

  const itemRows = items.map((i, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td>${esc(i.category)}${i.description ? `<div style="font-size:8pt;color:#7A7266;">${esc(i.description)}</div>` : ''}</td>
      <td style="text-align:center;">${Number(i.quantity)}</td>
      <td style="text-align:right;">${money(i.unit_price)}</td>
      <td style="text-align:right;">${money(i.amount)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>
    * { box-sizing: border-box; }
    html, body { background: #FFFFFF; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #2A2620; line-height: 1.6; margin: 0; }
    .meta-bar { display: flex; justify-content: space-between; font-size: 8pt; color: #7A7266; margin-bottom: 18px; font-family: Arial, Helvetica, sans-serif; }
    .title-block { text-align: center; margin-bottom: 18px; font-family: Arial, Helvetica, sans-serif; }
    .title-block h2 { font-size: 13pt; letter-spacing: 0.03em; color: #0B3D2E; margin: 0 0 4px; }
    .title-block .sub { font-size: 9.5pt; color: #4A3F32; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 9.5pt; font-family: Arial, Helvetica, sans-serif; margin-bottom: 18px; }
    .meta-grid span.lbl { color: #7A7266; }
    table.budget { width: 100%; border-collapse: collapse; margin-top: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
    table.budget th, table.budget td { border: 1px solid #DDD6C8; padding: 6px 8px; vertical-align: top; }
    table.budget th { background: #F4EFE3; color: #0B3D2E; text-align: left; }
    table.budget tfoot td { font-weight: bold; background: #F4EFE3; }
    .note { margin-top: 18px; font-size: 9.5pt; font-family: Arial, Helvetica, sans-serif; }
    .note .lbl { color: #7A7266; }
  </style></head><body>
    ${renderLetterhead(school)}
    <div class="meta-bar">
      <span>Department Budget</span>
      <span>Generated ${generatedOn}</span>
    </div>
    <div class="title-block">
      <h2>BUDGET ESTIMATES — ${esc(budget.department_name)}</h2>
      <div class="sub">${esc(budget.academic_year_name)}</div>
    </div>
    <div class="meta-grid">
      <div><span class="lbl">Status:</span> ${esc(budget.status)}</div>
      <div><span class="lbl">Submitted by:</span> ${esc(budget.submitted_by_name || '—')}</div>
      <div><span class="lbl">Reviewed by:</span> ${esc(budget.reviewed_by_name || '—')}</div>
      <div><span class="lbl">Reviewed on:</span> ${budget.reviewed_at ? esc(new Date(budget.reviewed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })) : '—'}</div>
    </div>
    <table class="budget">
      <thead>
        <tr>
          <th style="width:34px;text-align:center;">NO.</th>
          <th>ITEM / ACTIVITY DESCRIPTION</th>
          <th style="width:80px;text-align:center;">QUANTITY</th>
          <th style="width:110px;text-align:right;">UNIT PRICE (GH₵)</th>
          <th style="width:120px;text-align:right;">ESTIMATED AMT (GH₵)</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right;">TOTAL</td>
          <td style="text-align:right;">${money(total)}</td>
        </tr>
      </tfoot>
    </table>
    ${budget.review_note ? `<div class="note"><span class="lbl">Review note:</span> ${esc(budget.review_note).replace(/\n/g, '<br/>')}</div>` : ''}
  </body></html>`;
}

async function generateBudgetReportPDFBuffer(budget, items, school) {
  const html = buildBudgetReportHTML(budget, items, school);
  const executablePath = await resolveChromePath();
  const browser = await puppeteer.launch({
    args:            chromeLaunchArgs(),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    return Buffer.from(await page.pdf({
      format: 'A4', landscape: false, printBackground: true,
      margin: { top: '18mm', right: '18mm', bottom: '16mm', left: '18mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-size:7pt;color:#7A7266;display:flex;justify-content:space-between;padding:0 18mm;font-family:Arial,Helvetica,sans-serif;">
        <span>CAS Services</span><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    }));
  } finally {
    await browser.close();
  }
}

module.exports = {
  generateAndUploadPDF, buildLetterHTML,
  buildAdmissionLetterHTML, generateAdmissionLetterPDF,
  validateTemplate,
  buildCardMarkup, buildCardBackMarkup, buildCardHTML, generateCardBuffer,
  buildBatchHTML, generateBatchAndUpload,
  generateCardPng,
  buildExamAnalysisReportHTML, generateExamAnalysisReportPDFBuffer, generateChartPngBuffer,
  buildBoardReportHTML, generateBoardReportPDFBuffer,
  buildObservationReportHTML, generateObservationReportPDFBuffer,
  buildBlankObservationFormHTML, generateBlankObservationFormPDFBuffer,
  buildBudgetReportHTML, generateBudgetReportPDFBuffer,
};
