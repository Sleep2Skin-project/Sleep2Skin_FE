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
//
// 🚨 PNG를 쓴다, SVG가 아니다 — app-tabs.tsx(네이티브)는 expo-router의 <NativeTabs>로 진짜 OS
// 탭바(iOS UITabBarItem/Android BottomNavigationView)를 그리는데, 그 네이티브 아이콘 로더는
// 래스터 이미지만 디코딩하고 SVG(XML)는 못 읽어 아이콘이 빈 채로 뜬다(웹은 app-tabs.web.tsx가
// <Image>로 그려 브라우저가 SVG를 직접 렌더링하므로 문제가 없었다 — 그래서 웹에서만 멀쩡해
// 보였다). PNG는 두 경로 모두에서 동작하므로 플랫폼 분기 없이 하나로 공유한다.
//
// 🚨 반드시 @2x/@3x 밀도 변형을 같이 둔다 — <NativeTabs.Icon>은 web과 달리 크기를 지정하는
// props가 없어서(style/width/height 없음), 아이콘이 화면에 그려지는 크기가 RN의 이미지 asset
// 해상도 추론에 그대로 좌우된다. 파일명에 "@2x"/"@3x"가 없으면 RN은 그 이미지를 1x(=파일의
// 픽셀 치수를 곧 pt 치수로) 취급하는데, 예전엔 세로 120px짜리 원본 하나만 있어서 네이티브 탭바
// 아이콘이 실제로 세로 120pt로(3배 기기에서는 이보다 더) 커져 있었다. 지금은 세로 26pt(Apple
// HIG/Android 권장 탭 아이콘 크기 범위) 기준으로 `<이름>.png`(1x, 26pt)/`<이름>@2x.png`(52px)/
// `<이름>@3x.png`(78px) 세 벌을 두고, require()는 그대로 베이스 파일명(1x)만 가리키면 Metro가
// 기기 밀도에 맞는 파일을 알아서 골라 쓴다.
export const NAV_BAR_ICON_SOURCES: Record<TabItem['name'], { active: ImageSourcePropType; inactive: ImageSourcePropType }> = {
  index: {
    active: require('@/assets/images/figma-icon-navbar-home-active.png'),
    inactive: require('@/assets/images/figma-icon-navbar-home-inactive.png'),
  },
  todo: {
    active: require('@/assets/images/figma-icon-navbar-todo-active.png'),
    inactive: require('@/assets/images/figma-icon-navbar-todo-inactive.png'),
  },
  report: {
    active: require('@/assets/images/figma-icon-navbar-report-active.png'),
    inactive: require('@/assets/images/figma-icon-navbar-report-inactive.png'),
  },
  my: {
    active: require('@/assets/images/figma-icon-navbar-my-active.png'),
    inactive: require('@/assets/images/figma-icon-navbar-my-inactive.png'),
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
