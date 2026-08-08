import { usePathname } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TabSymbol } from '@/components/ui/tab-symbol';
import { TAB_ITEMS, tabBarStyles } from '@/constants/tabs';
import { useTheme } from '@/hooks/use-theme';

// 하단 탭 내비게이션(HOME/TODO/REPORT/MY) — docs/home.png 와이어프레임의 깔끔한 아이콘 레이아웃을 따른다.
export default function AppTabs() {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList
        style={[
          tabBarStyles.bar,
          { backgroundColor: theme.background, borderTopColor: theme.backgroundElement },
        ]}>
        {TAB_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const themeColor = isActive ? 'text' : 'textSecondary';

          return (
            <TabTrigger key={item.name} name={item.name} href={item.href} style={tabBarStyles.item}>
              <TabSymbol sf={item.sf} android={item.android} tintColor={theme[themeColor]} size={22} />
              <ThemedText type="small" themeColor={themeColor} style={tabBarStyles.label}>
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
});
