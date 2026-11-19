// Evidence photos are shrunk before upload, to about 40 KB, the same as
// lesson submission and the web portal: 640 px wide at JPEG quality 0.4, or
// 480 px at 0.25 if that is still too big.
import * as ImageManipulator from 'expo-image-manipulator';

export async function compressPhoto(uri: string): Promise<{ dataUrl: string; kb: number }> {
  const jpeg = (width: number, compress: number) =>
    ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  let out = await jpeg(640, 0.4);
  if ((out.base64?.length ?? 0) * 0.75 > 40 * 1024) out = await jpeg(480, 0.25);
  const b64 = out.base64 ?? '';
  return { dataUrl: `data:image/jpeg;base64,${b64}`, kb: Math.round((b64.length * 0.75) / 1024) };
}
