import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { TAB_ITEMS } from '@/constants/tabs';
import { Colors } from '@/constants/theme';

// 하단 탭 내비게이션(HOME/TODO/REPORT/MY) — docs/home.png 와이어프레임의 깔끔한 아이콘 레이아웃을 따른다.
export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme ?? 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      {TAB_ITEMS.map((item) => (
        <NativeTabs.Trigger key={item.name} name={item.name}>
          <Label>{item.label}</Label>
          <Icon sf={item.sf} androidSrc={<MaterialIcons name={item.android} size={24} />} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
