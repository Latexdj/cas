'use client';

interface PrintLetterModalProps {
  open: boolean;
  onClose: () => void;
  letter: {
    ref_number?: string;
    issued_date: string;
    subject: string;
    body: string;
    issued_by_name: string;
    issued_by_signature_url?: string;
    student_name?: string;
    student_code?: string;
    class_name?: string;
    letter_type?: string;
    teacher_name?: string;
    department?: string;
  };
  school: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    letterhead_url?: string;
    headmaster_signature_url?: string;
    logo_url?: string;
    motto?: string;
  };
  recipientType: 'student' | 'teacher';
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function firstName(name?: string) {
  return name ? name.split(' ')[0] : 'Sir/Madam';
}

export function PrintLetterModal({ open, onClose, letter, school, recipientType }: PrintLetterModalProps) {
  const recipientName = recipientType === 'student' ? letter.student_name : letter.teacher_name;
  const recipientSub  = recipientType === 'student'
    ? [letter.class_name, letter.student_code].filter(Boolean).join(' · ')
    : (letter.department ?? '');
  const sigUrl = letter.issued_by_signature_url || school.headmaster_signature_url;

  function buildLetterHTML() {
    const letterheadHtml = school.letterhead_url
      ? `<img src="${school.letterhead_url}" style="width:100%;display:block;margin-bottom:24px;" />`
      : `<div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0B3D2E;">
           <h2 style="margin:0 0 6px;font-size:18pt;color:#0B3D2E;letter-spacing:0.02em;">${school.name ?? ''}</h2>
           ${school.motto ? `<p style="margin:2px 0;font-size:10pt;font-style:italic;color:#4A3F32;">${school.motto}</p>` : ''}
           <div style="margin-top:8px;font-size:10pt;color:#4A3F32;">
             ${school.address ? `<span>${school.address}</span>` : ''}
             ${school.phone  ? ` &nbsp;·&nbsp; Tel: ${school.phone}` : ''}
             ${school.email  ? ` &nbsp;·&nbsp; ${school.email}` : ''}
           </div>
         </div>`;

    const sigHtml = sigUrl
      ? `<img src="${sigUrl}" style="display:block;max-height:80px;max-width:220px;margin-top:20px;" />`
      : `<div style="margin-top:48px;"></div>`;

    return `${letterheadHtml}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin:0 0 20px;font-size:11pt;">
        <div><strong>Ref:</strong> ${letter.ref_number ?? '—'}</div>
        <div><strong>Date:</strong> ${fmtDate(letter.issued_date)}</div>
      </div>
      <div style="margin:0 0 24px;font-size:11pt;line-height:1.7;">
        <div>To:</div>
        <div style="font-weight:bold;">${recipientName ?? ''}</div>
        ${recipientSub ? `<div style="color:#4A3F32;">${recipientSub}</div>` : ''}
      </div>
      <div style="margin:0 0 24px;font-size:13pt;font-weight:bold;text-decoration:underline;text-transform:uppercase;">
        ${letter.subject}
      </div>
      <p style="margin:0 0 16px;font-size:11pt;">Dear ${firstName(recipientName)},</p>
      <div style="margin:0 0 40px;font-size:11pt;line-height:1.8;white-space:pre-wrap;">${letter.body}</div>
      <p style="margin:0;font-size:11pt;">Yours faithfully,</p>
      ${sigHtml}
      <div style="border-top:1px solid #000;width:240px;margin-top:6px;padding-top:8px;">
        <div style="font-weight:bold;font-size:11pt;">${letter.issued_by_name}</div>
        <div style="font-size:10pt;color:#4A3F32;">${school.name ?? ''}</div>
      </div>`;
  }

  function handlePrint() {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${school.name ?? 'Letter'} — ${letter.subject}</title>
  <style>
    @page { margin: 22mm 20mm; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; color: #000; line-height: 1.6; max-width: 720px; margin: 0 auto; }
    img { max-width: 100%; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>${buildLetterHTML()}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(11,61,46,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col w-full"
        style={{ maxWidth: 760, maxHeight: '92vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: '#E2D9CC' }}
        >
          <div>
            <p className="font-bold text-sm" style={{ color: '#2C2218' }}>Print Preview</p>
            <p className="text-xs" style={{ color: '#8C7E6E' }}>
              {letter.ref_number ? `Ref: ${letter.ref_number} · ` : ''}
              {fmtDate(letter.issued_date)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#0B3D2E' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: '#E2D9CC', color: '#4A3F32' }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Letter preview */}
        <div className="flex-1 overflow-y-auto p-5" style={{ background: '#F5F0E8' }}>
          <div
            className="bg-white rounded-xl mx-auto p-10 shadow-sm"
            style={{
              maxWidth: 680,
              fontFamily: "Georgia, 'Times New Roman', serif",
              minHeight: 800,
            }}
            dangerouslySetInnerHTML={{ __html: buildLetterHTML() }}
          />
        </div>
      </div>
    </div>
  );
}
