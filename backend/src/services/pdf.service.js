'use strict';
// @sparticuz/chromium v149+ ships as an ES module; require() gives the module
// wrapper with the real API on .default. Earlier versions exposed it directly.
const _chromiumPkg = require('@sparticuz/chromium');
const chromium  = _chromiumPkg.default || _chromiumPkg;
const puppeteer = require('puppeteer-core');
const QRCode    = require('qrcode');
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

function buildLetterHTML({ letter, school, recipientType, watermark = false }) {
  const sigUrl = letter.issued_by_signature_url || school.headmaster_signature_url;

  const letterheadHtml = school.letterhead_url
    ? `<img src="${school.letterhead_url}" style="width:100%;display:block;margin-bottom:24px;" />`
    : `<div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0B3D2E;">
         <h2 style="margin:0 0 6px;font-size:18pt;color:#0B3D2E;letter-spacing:0.02em;">${esc(school.name)}</h2>
         ${school.motto ? `<p style="margin:2px 0;font-size:10pt;font-style:italic;color:#4A3F32;">${esc(school.motto)}</p>` : ''}
         <div style="margin-top:8px;font-size:10pt;color:#4A3F32;">
           ${school.address ? `<span>${esc(school.address)}</span>` : ''}
           ${school.phone ? ` &nbsp;·&nbsp; Tel: ${esc(school.phone)}` : ''}
           ${school.email ? ` &nbsp;·&nbsp; ${esc(school.email)}` : ''}
         </div>
       </div>`;

  const sigHtml = sigUrl
    ? `<img src="${sigUrl}" style="display:block;max-height:80px;max-width:220px;margin-top:20px;" />`
    : `<div style="margin-top:48px;"></div>`;

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

// Returns the Supabase public URL of the uploaded PDF.
async function generateAndUploadPDF({ letter, school, recipientType, watermark = false, pathPrefix = 'letters' }) {
  const html = buildLetterHTML({ letter, school, recipientType, watermark });

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
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    pdfBuffer = await page.pdf({
      format:           'A4',
      margin:           { top: '22mm', right: '20mm', bottom: '22mm', left: '20mm' },
      printBackground:  true,
    });
  } finally {
    await browser.close();
  }

  const prefix   = watermark ? 'draft' : 'final';
  const filePath = `${pathPrefix}/${prefix}-${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (error) throw new Error(`PDF storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// ── ID Card ───────────────────────────────────────────────────────────────────
// CR80 dimensions: 85.6 × 54 mm.
// Forest green: #1B5635  |  Gold: #C9A227

// Returns an HTML fragment (no doctype/head) for one CR80 card.
// Phase 3 batch will call this per card and tile them onto an A4 sheet.
function buildCardMarkup({ student, card, school, qrDataUrl }) {
  const expires = card.expires_at
    ? new Date(card.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'No expiry';

  const photoHtml = student.picture_url
    ? `<img src="${esc(student.picture_url)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<svg viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;fill:#bbb;">
         <circle cx="20" cy="16" r="10"/>
         <path d="M0 50 Q0 32 20 32 Q40 32 40 50Z"/>
       </svg>`;

  const indexRow = student.jhs_index_number
    ? `<div style="font-size:4pt;color:#333;line-height:1.55;font-family:Arial,sans-serif;">
         <span style="color:#888;">Index </span>${esc(student.jhs_index_number)}
       </div>`
    : '';

  return `<div style="width:85.6mm;height:54mm;display:flex;flex-direction:column;font-family:Georgia,'Times New Roman',serif;background:#fff;overflow:hidden;">
  <div style="background:#1B5635;padding:1.8mm 2.5mm;display:flex;justify-content:space-between;align-items:center;height:10mm;flex-shrink:0;">
    <div style="color:#C9A227;font-size:5pt;font-weight:bold;letter-spacing:0.04em;text-transform:uppercase;max-width:63mm;line-height:1.2;font-family:Arial,sans-serif;">${esc(school.name)}</div>
    <div style="color:#C9A227;font-size:7.5pt;font-weight:bold;font-family:Arial,sans-serif;letter-spacing:0.12em;">CAS</div>
  </div>
  <div style="flex:1;display:flex;padding:2mm 2.5mm 1mm;gap:2mm;overflow:hidden;">
    <div style="width:15.9mm;height:20mm;flex-shrink:0;border:0.3mm solid #ddd;overflow:hidden;background:#f5f5f5;">${photoHtml}</div>
    <div style="flex:1;display:flex;flex-direction:column;gap:0.4mm;padding-top:0.3mm;overflow:hidden;">
      <div style="font-size:5.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:0.02em;color:#111;line-height:1.3;font-family:Georgia,'Times New Roman',serif;margin-bottom:0.8mm;">${esc(student.name)}</div>
      <div style="font-size:4pt;color:#333;line-height:1.55;font-family:Arial,sans-serif;"><span style="color:#888;">Class </span>${esc(student.class_name ?? '—')}</div>
      ${indexRow}
      <div style="font-size:4pt;color:#333;line-height:1.55;font-family:Arial,sans-serif;"><span style="color:#888;">Code  </span>${esc(student.student_code ?? '—')}</div>
      <div style="font-size:4pt;color:#333;line-height:1.55;font-family:Arial,sans-serif;"><span style="color:#888;">Issue </span>#${card.issue_number}</div>
    </div>
    <div style="display:flex;align-items:flex-end;justify-content:flex-end;flex-shrink:0;">
      <div style="background:#fff;padding:0.5mm;border:0.3mm solid #e0e0e0;">
        <img src="${qrDataUrl}" style="display:block;width:19mm;height:19mm;" />
      </div>
    </div>
  </div>
  <div style="background:#1B5635;padding:1mm 2.5mm;display:flex;justify-content:space-between;align-items:center;height:6mm;flex-shrink:0;">
    <div style="color:rgba(201,162,39,0.9);font-size:3.5pt;font-family:Arial,sans-serif;">Valid to ${expires}</div>
    <div style="color:rgba(201,162,39,0.9);font-size:3.5pt;font-family:Arial,sans-serif;">Issue #${card.issue_number}</div>
  </div>
</div>`;
}

// Wraps one card markup in a full CR80-sized HTML document for standalone printing.
function buildCardHTML({ student, card, school, qrDataUrl }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 85.6mm 54mm; margin: 0; }
  *  { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 85.6mm; height: 54mm; overflow: hidden; }
</style>
</head>
<body>${buildCardMarkup({ student, card, school, qrDataUrl })}</body>
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

// Generates a CR80 PDF buffer for a single student card.
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
    defaultViewport: { width: 323, height: 204 },
    executablePath,
    headless:        true,
  });

  let pdfBuffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    pdfBuffer = await page.pdf({
      width:           '85.6mm',
      height:          '54mm',
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }

  return pdfBuffer;
}

// ── Batch card tiling ─────────────────────────────────────────────────────────
// Tiles an array of { student, card, school, qrDataUrl } objects onto A4 sheets,
// 8 cards per sheet (2 columns × 4 rows) with thin crop-mark borders.
// Uses buildCardMarkup() — no duplication of card template.
function buildBatchHTML(entries) {
  // Chunk into groups of 8 (one A4 sheet each).
  const sheets = [];
  for (let i = 0; i < entries.length; i += 8) {
    const chunk = entries.slice(i, i + 8);
    const slots = chunk.map(e => `
  <div class="crop-slot">${buildCardMarkup(e)}</div>`).join('');
    sheets.push(`<div class="sheet">${slots}\n</div>`);
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
    /* Thin border serves as cut guide */
    box-shadow: 0 0 0 0.3mm rgba(140,140,140,0.45);
  }
</style>
</head>
<body>
${sheets.join('\n')}
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
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 60000 });
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

module.exports = {
  generateAndUploadPDF, buildLetterHTML,
  buildCardMarkup, buildCardHTML, generateCardBuffer,
  buildBatchHTML, generateBatchAndUpload,
};
