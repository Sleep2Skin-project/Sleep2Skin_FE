import { usePathname } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TAB_ITEMS = [
  { name: 'home', href: '/', label: 'HOME', icon: 'home' },
  { name: 'todo', href: '/todo', label: 'TODO', icon: 'checklist' },
  { name: 'report', href: '/report', label: 'REPORT', icon: 'bar_chart' },
  { name: 'my', href: '/my', label: 'MY', icon: 'account_circle' },
] as const;

// 하단 탭 내비게이션(HOME/TODO/REPORT/MY) — docs/home.png 와이어프레임의 깔끔한 아이콘 레이아웃을 따른다.
export default function AppTabs() {
  const theme = useTheme();
  const pathname = usePathname();

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList
        style={[
          styles.tabList,
          { backgroundColor: theme.background, borderTopColor: theme.backgroundElement },
        ]}>
        {TAB_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const themeColor = isActive ? 'text' : 'textSecondary';

          return (
            <TabTrigger key={item.name} name={item.name} href={item.href} style={styles.tabTrigger}>
              <SymbolView name={{ web: item.icon }} tintColor={theme[themeColor]} size={22} />
              <ThemedText type="small" themeColor={themeColor} style={styles.label}>
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
  tabList: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabTrigger: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.two,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
  },
});
