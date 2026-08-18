import type { SFSymbol } from 'expo-symbols';
import { StyleSheet, type ImageSourcePropType } from 'react-native';

import type { MaterialIconName } from '@/components/ui/tab-symbol';
import { Spacing } from '@/constants/theme';

export type TabItem = {
  name: 'index' | 'todo' | 'report' | 'my';
  // 실제로 동작하는 경로 그대로다(정적 빌드에도 "/ (index)"로 나온다) — expo-router의 자동
  // 생성 타입(.expo/types/router.d.ts)이 (tabs) 그룹 안의 index 라우트를 "/index"로만 잡고
  // "/"는 빠뜨리는 알려진 갭이 있어, 이 값을 쓰는 곳(app-tabs.web.tsx, selfie-verification-flow.tsx)
  // 에서 `as Href`로 캐스팅한다.
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

// Figma "Ui (복사)" 파일, node-id=694-3136 하단 내비게이션 바(#724:1372) 스펙을 그대로 옮긴 고정
// 색상 — 흰 배경(#FFFFFF) + 위쪽 1px 보더(#B7B7B7), 선택된 탭은 검정(#000000), 나머지는
// 회색(#9E9E9E). 예전엔 useTheme()을 따라가서 시스템이 다크 모드면 네비바만 검게 바뀌어 화면
// 배경(대부분 Figma가 지정한 흰색/연한 블루로 테마와 무관하게 고정)과 어긋나 보였다
// (docs/네비바.jpg) — 네비바는 화면이 라이트든 다크든 항상 이 값 그대로, 모든 페이지에서 통일한다.
export const NAV_BAR_BACKGROUND = '#FFFFFF';
export const NAV_BAR_BORDER = '#B7B7B7';
export const NAV_BAR_ACTIVE_COLOR = '#000000';
export const NAV_BAR_INACTIVE_COLOR = '#9E9E9E';

// 같은 노드(#724:1372) 하위 아이콘 4개(#724:1378~1381, Figma REST API로 그대로 내려받은 벡터) —
// 예전엔 SF Symbol("house" 등)·MaterialIcons("home" 등)로 의미만 비슷한 시스템 아이콘을 대신
// 썼는데, 그 모양이 Figma 시안과 달라 보였다. Figma가 내려준 한 SVG는 그 프레임에서 그 탭이
// 마침 활성/비활성이었던 상태의 fill 색 하나만 담고 있어(예: REPORT는 활성=검정, 나머지는
// 비활성=회색), 두 상태를 다 쓰려면 fill만 바꾼 사본이 필요해서 active/inactive 두 벌로
// 나눠뒀다(모양은 완전히 동일, 색만 다름).
export const NAV_BAR_ICON_SOURCES: Record<TabItem['name'], { active: ImageSourcePropType; inactive: ImageSourcePropType }> = {
  index: {
    active: require('@/assets/images/figma-icon-navbar-home-active.svg'),
    inactive: require('@/assets/images/figma-icon-navbar-home-inactive.svg'),
  },
  todo: {
    active: require('@/assets/images/figma-icon-navbar-todo-active.svg'),
    inactive: require('@/assets/images/figma-icon-navbar-todo-inactive.svg'),
  },
  report: {
    active: require('@/assets/images/figma-icon-navbar-report-active.svg'),
    inactive: require('@/assets/images/figma-icon-navbar-report-inactive.svg'),
  },
  my: {
    active: require('@/assets/images/figma-icon-navbar-my-active.svg'),
    inactive: require('@/assets/images/figma-icon-navbar-my-inactive.svg'),
  },
};

// app-tabs.web.tsx(JS로 그리는 웹 탭바)와 리포트 하단 내비게이션이 공유하는 레이아웃 수치.
export const tabBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: NAV_BAR_BORDER,
    backgroundColor: NAV_BAR_BACKGROUND,
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
