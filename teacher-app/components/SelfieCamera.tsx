import React, { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Body, Button, Row } from '@/components/ui/kit';

export interface Selfie { uri: string; dataUrl: string; kb: number }

// Front camera, compressed to about 40 KB like the web check-in.
// facing/width let other screens reuse it, e.g. a back-camera evidence photo.
export function SelfieCamera({ onTaken, onCancel, facing = 'front', width = 640 }: { onTaken: (s: Selfie) => void; onCancel: () => void; facing?: 'front' | 'back'; width?: number }) {
  const [perm, requestPerm] = useCameraPermissions();
  const ref = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (Platform.OS === 'web') return <Body soft>Taking a selfie needs the phone app.</Body>;
  if (!perm?.granted) {
    return (
      <View style={{ gap: 8 }}>
        <Body soft>{perm?.canAskAgain === false ? 'Camera access is off for CAS Teacher. Allow it in phone settings.' : 'CAS Teacher needs the camera to take the photo.'}</Body>
        <Row>
          {perm?.canAskAgain !== false && <Button label="Allow camera" grow onPress={requestPerm} />}
          <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
        </Row>
      </View>
    );
  }

  async function take() {
    setBusy(true); setErr('');
    try {
      const photo = await ref.current?.takePictureAsync({ quality: 1 });
      if (!photo) return;
      let out = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width } }], { compress: width > 640 ? 0.7 : 0.4, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (width <= 640 && (out.base64?.length ?? 0) * 0.75 > 40 * 1024) {
        out = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 480 } }], { compress: 0.25, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      }
      onTaken({ uri: out.uri, dataUrl: `data:image/jpeg;base64,${out.base64}`, kb: Math.round(((out.base64?.length ?? 0) * 0.75) / 1024) });
    } catch { setErr('Could not take the photo. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
        <CameraView ref={ref} style={{ flex: 1 }} facing={facing} />
      </View>
      {!!err && <Body small style={{ color: '#B83232' }}>{err}</Body>}
      <Row>
        <Button label="Take photo" icon="camera-outline" busy={busy} grow onPress={take} />
        <Button label="Cancel" kind="secondary" grow onPress={onCancel} />
      </Row>
    </View>
  );
}
