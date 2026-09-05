'use strict';
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
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
  const recipientName = recipientType === 'student' ? letter.student_name : letter.teacher_name;
  const recipientSub  = recipientType === 'student'
    ? [letter.class_name, letter.student_code].filter(Boolean).join(' · ')
    : (letter.department ?? '');
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

  return `<!DOCTYPE html>
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
  ${letterheadHtml}
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

  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args:            [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless:        chromium.headless ?? 'new',
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

module.exports = { generateAndUploadPDF };
