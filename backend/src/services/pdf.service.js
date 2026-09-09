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

const BUCKET = process.env.STORAGE_BUCKET || 'attendance-photos';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
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

// Puppeteer footerTemplate: solid primary-colour band, white text.
// Left: vision/mission. Right: address/phone/email. Far-right cell: page number.
// Returns null if the school has nothing for either column (no footer rendered).
function buildFooterHtml(school) {
  const color = esc(school.primary_color || '#0B3D2E');
  const left = [
    school.vision  ? `<div><b>Our Vision:</b> ${esc(school.vision)}</div>`   : '',
    school.mission ? `<div><b>Our Mission:</b> ${esc(school.mission)}</div>` : '',
  ].filter(Boolean).join('');
  const right = [
    school.address ? `<div>${esc(school.address)}</div>`      : '',
    school.phone   ? `<div>Tel: ${esc(school.phone)}</div>`   : '',
    school.email   ? `<div>${esc(school.email)}</div>`        : '',
  ].filter(Boolean).join('');
  if (!left && !right) return null;
  return `<div style="
      width:100%;background:${color};color:#fff;
      font-family:Arial,Helvetica,sans-serif;font-size:7pt;line-height:1.55;
      padding:5px 20mm;box-sizing:border-box;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="vertical-align:top;width:60%;padding-right:8px;">${left || '&nbsp;'}</td>
        <td style="vertical-align:top;width:35%;text-align:right;">${right || '&nbsp;'}</td>
        <td style="vertical-align:middle;width:5%;text-align:right;padding-left:6px;white-space:nowrap;">
          <span class="pageNumber"></span>
        </td>
      </tr>
    </table>
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
  return sigUrl
    ? `<img src="${esc(sigUrl)}" style="display:block;max-height:80px;max-width:220px;margin-top:20px;" />`
    : `<div style="margin-top:48px;"></div>`;
}

function buildLetterHTML({ letter, school, recipientType, watermark = false }) {
  const sigUrl = letter.issued_by_signature_url || school.headmaster_signature_url;

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

  // ── External / parent recipients — formal business-letter format ──────────
  if (recipientType === 'external') {
    const extName = letter.ext_recipient_name || '';
    const extOrg  = letter.ext_recipient_org  || '';
    const extAddr = letter.ext_recipient_address || '';
    const salutation = extName ? `Dear ${esc(extName)},` : 'Dear Sir/Madam,';
    return `${pageHead}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 28px;font-size:11pt;">
    <div>${letter.ref_number ? `<strong>Ref:</strong> ${esc(letter.ref_number)}` : ''}</div>
    <div><strong>Date:</strong> ${fmtDate(letter.issued_date)}</div>
  </div>
  <div style="margin:0 0 28px;font-size:11pt;line-height:1.9;">
    ${extName ? `<div style="font-weight:bold;">${esc(extName)}</div>` : ''}
    ${extOrg ? `<div>${esc(extOrg)}</div>` : ''}
    ${extAddr ? `<div style="white-space:pre-line;">${esc(extAddr)}</div>` : ''}
  </div>
  <div style="margin:0 0 24px;font-size:13pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;">
    RE: ${esc(letter.subject)}
  </div>
  <p style="margin:0 0 16px;font-size:11pt;">${salutation}</p>
  <div style="margin:0 0 40px;font-size:11pt;line-height:1.8;white-space:pre-wrap;">${esc(letter.body)}</div>
  <p style="margin:0;font-size:11pt;">Yours faithfully,</p>
  ${sigHtml}
  <div style="border-top:1px solid #000;width:240px;margin-top:6px;padding-top:8px;">
    <div style="font-weight:bold;font-size:11pt;">${esc(letter.issued_by_name)}</div>
    <div style="font-size:10pt;color:#4A3F32;">${esc(school.name ?? '')}</div>
  </div>
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
  <div style="margin:0 0 24px;font-size:13pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;">
    ${esc(letter.subject)}
  </div>
  <p style="margin:0 0 16px;font-size:11pt;">Dear ${esc(firstWord(recipientName))},</p>
  <div style="margin:0 0 40px;font-size:11pt;line-height:1.8;white-space:pre-wrap;">${esc(letter.body)}</div>
  <p style="margin:0;font-size:11pt;">Yours faithfully,</p>
  ${sigHtml}
  <div style="border-top:1px solid #000;width:240px;margin-top:6px;padding-top:8px;">
    <div style="font-weight:bold;font-size:11pt;">${esc(letter.issued_by_name)}</div>
    <div style="font-size:10pt;color:#4A3F32;">${esc(school.name ?? '')}</div>
  </div>
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
    args:            [...(chromium.args ?? []), '--no-sandbox', '--disable-setuid-sandbox'],
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
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (error) throw new Error(`PDF storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// Returns the Supabase public URL of the uploaded PDF.
async function generateAndUploadPDF({ letter, school, recipientType, watermark = false, pathPrefix = 'letters' }) {
  const { resolvedSchool, resolvedExtras } = await resolveImages(school, {
    issued_by_signature_url: letter.issued_by_signature_url,
  });
  const resolvedLetter = { ...letter, ...resolvedExtras };
  const html     = buildLetterHTML({ letter: resolvedLetter, school: resolvedSchool, recipientType, watermark });
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
    ul, ol { margin: 0 0 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }
    strong { font-weight: bold; }
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
    <div style="margin-top:32px;">
      <p style="margin:0 0 4px;">Yours faithfully,</p>
      ${sigHtml}
      <div style="border-top:1px solid #000;width:220px;margin-top:6px;padding-top:8px;">
        <div style="font-weight:bold;font-size:11pt;">Admissions Office</div>
        <div style="font-size:10pt;color:#4A3F32;">${esc(school.name)}</div>
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
  const filePath     = `admissions/letters/letter-${application.id}-${Date.now()}.pdf`;
  return _renderToPDF(html, filePath, {
    footerTemplate: footerHtml || undefined,
    bottomMargin:   footerHtml ? '28mm' : '22mm',
  });
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
    args:            [...(chromium.args ?? []), '--no-sandbox', '--disable-setuid-sandbox'],
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
    pdfBuffer = await page.pdf({
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
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
    args:            [...(chromium.args ?? []), '--no-sandbox', '--disable-setuid-sandbox'],
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
    pdfBuffer = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
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
    args:            [...(chromium.args ?? []), '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 324, height: 204, deviceScaleFactor: 2 },
    executablePath,
    headless:        true,
  });

  let pngBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    pngBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 324, height: 204 } });
  } finally {
    await browser.close();
  }

  return pngBuffer;
}

module.exports = {
  generateAndUploadPDF, buildLetterHTML,
  buildAdmissionLetterHTML, generateAdmissionLetterPDF,
  validateTemplate,
  buildCardMarkup, buildCardBackMarkup, buildCardHTML, generateCardBuffer,
  buildBatchHTML, generateBatchAndUpload,
  generateCardPng,
};
