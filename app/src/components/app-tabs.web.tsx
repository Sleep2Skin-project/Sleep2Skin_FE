import { Image } from 'expo-image';
import { usePathname, type Href } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { NAV_BAR_ACTIVE_COLOR, NAV_BAR_ICON_SOURCES, NAV_BAR_INACTIVE_COLOR, TAB_ITEMS, tabBarStyles } from '@/constants/tabs';

// 하단 탭 내비게이션(HOME/TODO/REPORT/MY) — docs/home.png 와이어프레임의 깔끔한 아이콘 레이아웃을 따른다.
// 아이콘·색상 모두 Figma 네비바 스펙(NAV_BAR_* 상수, constants/tabs.ts 주석 참고)을 고정으로
// 쓴다 — 시스템 다크/라이트 모드를 따라가지 않고, 아이콘도 의미만 비슷한 시스템 아이콘 대신
// Figma가 내려준 벡터 그대로 그린다.
export default function AppTabs() {
  const pathname = usePathname();

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList style={tabBarStyles.bar}>
        {TAB_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const color = isActive ? NAV_BAR_ACTIVE_COLOR : NAV_BAR_INACTIVE_COLOR;
          const iconSource = NAV_BAR_ICON_SOURCES[item.name][isActive ? 'active' : 'inactive'];

          return (
            <TabTrigger key={item.name} name={item.name} href={item.href as Href} style={tabBarStyles.item}>
              <Image source={iconSource} style={styles.icon} contentFit="contain" />
              <ThemedText type="small" style={[tabBarStyles.label, { color }]}>
                {item.label}
              </ThemedText>
            </TabTrigger>
          );
        })}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  icon: {
    width: 22,
    height: 22,
  },
});
