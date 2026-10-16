'use strict';

// Downloadable exports for the public (no-login, pay-then-paste) WAEC
// results tool. Deliberately thin: both the PDF table layout and the Excel
// workbook layout already exist and are proven in production for the
// admin-side exam-results feature (pdf.service.js's
// generateExamAnalysisReportPDFBuffer, examAnalysisWorkbook.js's
// buildExamAnalysisWorkbook) — both take exactly the { report, school }
// shape buildPublicReport() in public-waec-results.js already produces, so
// this file reuses them unmodified rather than re-deriving the same table
// layout a second time. The one thing neither had before — a chart — is
// added here: the PDF path opts into the (now-optional, default-off, so
// the admin PDF export is unaffected) chart section built into
// generateExamAnalysisReportPDFBuffer itself, and the Excel path appends
// a chart image to its own extra worksheet rather than touching
// buildExamAnalysisWorkbook, so the admin Excel export is untouched too.
const { generateExamAnalysisReportPDFBuffer, generateChartPngBuffer } = require('./pdf.service');
const { buildExamAnalysisWorkbook } = require('./examAnalysisWorkbook');

function schoolFromReport(report) {
  return { name: report.schoolName || 'WASSCE Results Analysis' };
}

async function generatePublicWaecPDFBuffer(report) {
  return generateExamAnalysisReportPDFBuffer(report, schoolFromReport(report), { includeChart: true });
}

async function generatePublicWaecExcelBuffer(report) {
  const school = schoolFromReport(report);
  const wb = buildExamAnalysisWorkbook(report, school);

  if (report.subjects?.length) {
    const chartPng = await generateChartPngBuffer(report.subjects);
    const imageId = wb.addImage({ buffer: chartPng, extension: 'png' });
    const chartSheet = wb.addWorksheet('Pass Rate Chart', { properties: { tabColor: { argb: 'FFC8973A' } } });
    chartSheet.addImage(imageId, { tl: { col: 0.3, row: 0.5 }, ext: { width: 820, height: 380 } });
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { generatePublicWaecPDFBuffer, generatePublicWaecExcelBuffer };
