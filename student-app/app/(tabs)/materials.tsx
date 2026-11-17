import { View } from 'react-native';
import FileBrowser from '@/components/materials/FileBrowser';
import { AppUpdateBanner } from '@/components/AppUpdateBanner';

export default function MaterialsTab() {
  return (
    <View style={{ flex: 1 }}>
      <AppUpdateBanner style={{ paddingHorizontal: 16, paddingTop: 12 }} />
      <FileBrowser />
    </View>
  );
}
