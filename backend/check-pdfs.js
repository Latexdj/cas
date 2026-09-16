'use strict';
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const SCRATCHPAD = 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\1\\claude\\c--Users-Administrator-Desktop-cas\\3e123c1a-a717-43a6-8c40-cb5214087673\\scratchpad';

async function checkPdf(filename) {
  const fpath = path.join(SCRATCHPAD, filename);
  const buf = fs.readFileSync(fpath);
  const sig = buf.slice(0, 5).toString('ascii');
  if (sig !== '%PDF-') {
    console.log(`${filename}: NOT a valid PDF (signature: "${sig}")`);
    console.log(`  First 200 bytes as text: ${buf.slice(0, 200).toString('utf8')}`);
    return;
  }
  try {
    const data = await pdfParse(buf);
    console.log(`${filename}: OK — pages=${data.numpages} text_len=${data.text.length}`);
    console.log(`  First 400 chars: ${data.text.slice(0, 400).replace(/\n/g, ' ')}`);
  } catch (e) {
    console.log(`${filename}: parse error — ${e.message}`);
  }
}

(async () => {
  await checkPdf('ges-teacher-conduct.pdf');
  console.log();
  await checkPdf('ges-student-conduct.pdf');
})().catch(e => console.error(e.message));
