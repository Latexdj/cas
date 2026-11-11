// Opens generated HTML in a new window and prints it. Returns false when the
// browser blocked the pop-up.
export function printHtml(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}

// Prints an uploaded signed sheet. The file is fetched into a same-origin
// blob URL first, because the browser won't let us call print() on a
// cross-origin storage URL. Falls back to opening it for manual printing.
export async function printUploadedFile(url: string, mime: string | null): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blobUrl = URL.createObjectURL(await res.blob());

    if (mime === 'application/pdf') {
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.src = blobUrl;
      frame.onload = () => {
        setTimeout(() => {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        }, 300);
        setTimeout(() => { frame.remove(); URL.revokeObjectURL(blobUrl); }, 60_000);
      };
      document.body.appendChild(frame);
      return;
    }

    const w = window.open('', '_blank');
    if (!w) { window.open(url, '_blank'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>Signed sheet</title>
      <style>@page{margin:10mm}body{margin:0}img{width:100%;height:auto;display:block}</style></head>
      <body><img src="${blobUrl}" onload="setTimeout(function(){window.focus();window.print();},200)"></body></html>`);
    w.document.close();
  } catch {
    window.open(url, '_blank');
  }
}
