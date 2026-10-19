export interface ClinicVisitPrintable {
  id: string;
  patient_type: 'student' | 'teacher';
  patient_name: string;
  student_code: string | null;
  class_name: string | null;
  teacher_code: string | null;
  complaint: string;
  vitals_temp_c: number | null;
  vitals_bp: string | null;
  vitals_pulse: number | null;
  diagnosis_notes: string | null;
  treatment_given: string | null;
  outcome: string | null;
  severity: string;
  visit_date: string;
  arrived_at: string;
  closed_at: string | null;
}

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const OUTCOME_LABELS: Record<string, string> = {
  returned_to_class: 'Returned to class',
  sent_home: 'Sent home',
  referred_to_hospital: 'Referred to hospital',
  admitted_in_clinic: 'Admitted in clinic',
  other: 'Other',
};

export function buildClinicVisitHtml(visit: ClinicVisitPrintable): string {
  const idLine = visit.patient_type === 'student'
    ? `${visit.student_code ?? ''} / ${visit.class_name ?? ''}`
    : `Staff${visit.teacher_code ? ` / ${visit.teacher_code}` : ''}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Clinic Visit Slip</title>
<style>
@page { size: A5 portrait; margin: 1.2cm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
.doc-title { text-align: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; border-bottom: 2px solid #111; padding-bottom: 10px; }
.row { display: flex; gap: 6px; font-size: 11px; margin-bottom: 6px; }
.lbl { font-weight: 700; color: #444; width: 120px; flex-shrink: 0; }
.box { border: 1px solid #ddd; padding: 8px 10px; margin-bottom: 10px; background: #f8f8f8; }
.box .lbl { width: 100%; margin-bottom: 3px; }
.footer { margin-top: 28px; }
.sl { border-top: 1px solid #333; margin-top: 30px; padding-top: 3px; font-size: 10px; color: #555; width: 220px; }
@media print { html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc-title">Clinic Visit Slip</div>

<div class="row"><span class="lbl">Patient</span><span>${escHtml(visit.patient_name)}</span></div>
<div class="row"><span class="lbl">ID / Class</span><span>${escHtml(idLine)}</span></div>
<div class="row"><span class="lbl">Date</span><span>${escHtml(visit.visit_date)}</span></div>
<div class="row"><span class="lbl">Severity</span><span>${escHtml(visit.severity)}</span></div>

<div class="box">
  <div class="lbl">Reason for visit</div>
  <div>${escHtml(visit.complaint)}</div>
</div>

${(visit.vitals_temp_c || visit.vitals_bp || visit.vitals_pulse) ? `
<div class="row"><span class="lbl">Vitals</span><span>${[
    visit.vitals_temp_c ? `Temp ${escHtml(visit.vitals_temp_c)}°C` : '',
    visit.vitals_bp ? `BP ${escHtml(visit.vitals_bp)}` : '',
    visit.vitals_pulse ? `Pulse ${escHtml(visit.vitals_pulse)}` : '',
  ].filter(Boolean).join(', ')}</span></div>` : ''}

${visit.diagnosis_notes ? `
<div class="box">
  <div class="lbl">Diagnosis notes</div>
  <div>${escHtml(visit.diagnosis_notes)}</div>
</div>` : ''}

${visit.treatment_given ? `
<div class="box">
  <div class="lbl">Treatment given</div>
  <div>${escHtml(visit.treatment_given)}</div>
</div>` : ''}

<div class="row"><span class="lbl">Outcome</span><span>${escHtml(OUTCOME_LABELS[visit.outcome ?? ''] ?? (visit.outcome ?? 'Pending'))}</span></div>
${visit.closed_at ? `<div class="row"><span class="lbl">Closed</span><span>${escHtml(new Date(visit.closed_at).toLocaleString())}</span></div>` : ''}

<div class="footer">
  <div class="sl">Clinic Staff Signature</div>
</div>
</body>
</html>`;
}

export function printClinicVisit(visit: ClinicVisitPrintable) {
  const html = buildClinicVisitHtml(visit);
  const w = window.open('', '_blank');
  if (!w) {
    alert('Pop-ups are blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
