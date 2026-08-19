import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import {
  NAV_BAR_ACTIVE_COLOR,
  NAV_BAR_BACKGROUND,
  NAV_BAR_BORDER,
  NAV_BAR_ICON_SOURCES,
  NAV_BAR_INACTIVE_COLOR,
  TAB_ITEMS,
} from '@/constants/tabs';

// 하단 탭 내비게이션(HOME/TODO/REPORT/MY) — docs/home.png 와이어프레임의 깔끔한 아이콘 레이아웃을 따른다.
// 아이콘·색상 모두 Figma 네비바 스펙(NAV_BAR_* 상수, constants/tabs.ts 주석 참고)을 고정으로
// 쓴다 — 시스템 다크/라이트 모드를 따라가지 않고(예전엔 다크 모드에서 네비바만 검게 바뀌어 화면
// 배경과 어긋나 보였다, docs/네비바.jpg), 아이콘도 의미만 비슷한 SF Symbol/MaterialIcons 대신
// Figma가 내려준 벡터(NAV_BAR_ICON_SOURCES) 그대로 그린다.
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={NAV_BAR_BACKGROUND}
      shadowColor={NAV_BAR_BORDER}
      labelStyle={{ default: { color: NAV_BAR_INACTIVE_COLOR }, selected: { color: NAV_BAR_ACTIVE_COLOR } }}
      disableIndicator
      // iOS 15+는 콘텐츠가 하단 스크롤 엣지에 닿으면 backgroundColor를 무시하고 탭바를
      // 투명하게 만든다(scrollEdgeAppearance 기본 동작) — 그래서 backgroundColor를 흰색으로
      // 줘도 화면을 스크롤하면 흰 배경이 사라지고 콘텐츠가 탭바 뒤로 비쳐 보였다. 항상 고정된
      // 흰 배경을 유지하려면 이 옵션으로 그 기본 동작을 꺼야 한다.
      disableTransparentOnScrollEdge>
      {TAB_ITEMS.map((item) => (
        <NativeTabs.Trigger key={item.name} name={item.name}>
          <Label>{item.label}</Label>
          <Icon src={{ default: NAV_BAR_ICON_SOURCES[item.name].inactive, selected: NAV_BAR_ICON_SOURCES[item.name].active }} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
