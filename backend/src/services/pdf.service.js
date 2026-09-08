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

function toTitleCase(str) {
  if (!str) return '';
  const minors = new Set(['and','of','the','in','for','a','an','to','at','by','with','de']);
  return str.toLowerCase().replace(/[^\s-]+/g, (word, offset) => {
    if (offset > 0 && minors.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
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
// Design language: sleek minimal — vertical color bar, square photo, clean type hierarchy.
// No clip-path, no diagonal shapes, no circular elements.

// FRONT of card — returns an HTML fragment (no doctype/head).
function buildCardMarkup({ student, card, school, qrDataUrl }) {
  const primary = esc(school.primary_color || '#007A8C');
  const accent  = esc(school.accent_color  || '#B8860B');

  const expires = card.expires_at
    ? new Date(card.expires_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase()
    : 'NO EXPIRY';

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
    ? `<img src="${esc(school.logo_url)}" style="width:7.5mm;height:7.5mm;object-fit:contain;flex-shrink:0;" />`
    : '';

  const sigHtml = school.headmaster_signature_url
    ? `<img src="${esc(school.headmaster_signature_url)}" style="display:block;max-height:6mm;max-width:18mm;object-fit:contain;" />`
    : `<div style="height:6mm;"></div>`;

  const vision  = (school.vision      || '').trim();
  const mission = (school.mission     || '').trim();
  const values  = (school.core_values || '').trim();
  const c1      = (school.lost_card_contact_1 || '').trim();
  const c2      = (school.lost_card_contact_2 || '').trim();
  const hdmName = (school.headmaster_name || 'Headmaster').trim();

  const contactLine = c1 && c2
    ? `If found, contact ${esc(c1)} or ${esc(c2)}`
    : c1 ? `If found, contact ${esc(c1)}` : '';

  function infoBlock(label, text) {
    if (!text) return '';
    return `<div style="overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.5;">
      <span style="font-size:5.5pt;font-weight:800;color:${accent};text-transform:uppercase;letter-spacing:0.06em;">${label} </span>
      <span style="font-size:5.5pt;color:#334155;">${esc(text)}</span>
    </div>`;
  }

  return `<div style="width:85.6mm;height:54mm;display:flex;background:#F7F9FB;overflow:hidden;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;">

  <!-- Card body -->
  <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">

    <!-- Top strip -->
    <div style="height:11mm;background:${accent};display:flex;align-items:center;padding:0 2.5mm;gap:1.5mm;flex-shrink:0;">
      ${logoHtml}
      <div style="flex:1;overflow:hidden;">
        <div style="color:white;font-size:5.5pt;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;line-height:1.3;">THIS CARD IS THE PROPERTY OF</div>
        <div style="color:rgba(255,255,255,0.9);font-size:11pt;font-weight:900;text-transform:uppercase;letter-spacing:0.03em;line-height:1.2;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(school.name)}</div>
      </div>
    </div>

    <!-- Hairline -->
    <div style="height:1px;background:${primary};flex-shrink:0;opacity:0.4;"></div>

    <!-- Body -->
    <div style="flex:1;padding:1.8mm 2.5mm 1mm;display:flex;flex-direction:column;gap:1.5mm;overflow:hidden;">
      ${infoBlock('Vision:', vision)}
      ${infoBlock('Mission:', mission)}
      ${infoBlock('Values:', values)}
      ${contactLine ? `<div style="font-size:5pt;font-style:italic;color:#64748B;line-height:1.45;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${contactLine}</div>` : ''}
    </div>

    <!-- Footer -->
    <div style="height:11mm;background:${primary};display:flex;align-items:center;justify-content:space-between;padding:0 2.5mm;flex-shrink:0;overflow:hidden;">
      <div style="display:flex;flex-direction:column;gap:0.8mm;overflow:hidden;min-width:0;">
        ${sigHtml}
        <div style="width:20mm;height:0.3mm;background:rgba(255,255,255,0.5);flex-shrink:0;"></div>
        <div style="color:white;font-size:5.5pt;font-weight:700;letter-spacing:0.06em;white-space:nowrap;">${esc(hdmName)}</div>
      </div>
      <!-- Decorative dots -->
      <div style="display:flex;align-items:center;gap:1.2mm;flex-shrink:0;">
        <div style="width:2.5mm;height:2.5mm;border-radius:50%;background:rgba(255,255,255,0.25);"></div>
        <div style="width:3.5mm;height:3.5mm;border-radius:50%;background:rgba(255,255,255,0.4);"></div>
        <div style="width:5mm;height:5mm;border-radius:50%;background:rgba(255,255,255,0.55);"></div>
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
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
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
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    pngBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 324, height: 204 } });
  } finally {
    await browser.close();
  }

  return pngBuffer;
}

module.exports = {
  generateAndUploadPDF, buildLetterHTML,
  buildCardMarkup, buildCardBackMarkup, buildCardHTML, generateCardBuffer,
  buildBatchHTML, generateBatchAndUpload,
  generateCardPng,
};
