// Photos taken as evidence (lesson submission, lesson observation) are shrunk
// in the browser before upload, to about 40 KB: 640 px wide at JPEG quality
// 0.4, or 480 px at 0.25 if that is still too big. Small uploads matter on
// school Wi-Fi and mobile data.
export function compressToBase64(file: File): Promise<{ dataUrl: string; kb: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const compress = (w: number, q: number): string => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, w / img.width);
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const g = canvas.getContext('2d')!;
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, canvas.width, canvas.height);   // transparent PNGs get a white background
        g.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', q);
      };
      let dataUrl = compress(640, 0.4);
      if (dataUrl.length * 0.75 > 40 * 1024) dataUrl = compress(480, 0.25);
      resolve({ dataUrl, kb: Math.round(dataUrl.length * 0.75 / 1024) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
    img.src = url;
  });
}
