import type { SFSymbol } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import type { MaterialIconName } from '@/components/ui/tab-symbol';
import { Spacing } from '@/constants/theme';

export type TabItem = {
  name: 'index' | 'todo' | 'report' | 'my';
  href: '/' | '/todo' | '/report' | '/my';
  label: string;
  sf: SFSymbol;
  android: MaterialIconName;
};

// 메인 탭바(app-tabs.tsx/app-tabs.web.tsx)와 셀피 검증 리포트 하단 내비게이션
// (selfie-verification-flow.tsx)이 모두 이 목록 하나를 공유해, 탭 구성이 갈라지지 않게 한다.
export const TAB_ITEMS: readonly TabItem[] = [
  { name: 'index', href: '/', label: 'HOME', sf: 'house', android: 'home' },
  { name: 'todo', href: '/todo', label: 'TODO', sf: 'checklist', android: 'checklist' },
  { name: 'report', href: '/report', label: 'REPORT', sf: 'chart.bar', android: 'bar-chart' },
  { name: 'my', href: '/my', label: 'MY', sf: 'person.crop.circle', android: 'account-circle' },
] as const;

// app-tabs.web.tsx(JS로 그리는 웹 탭바)와 리포트 하단 내비게이션이 공유하는 레이아웃 수치.
export const tabBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
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
