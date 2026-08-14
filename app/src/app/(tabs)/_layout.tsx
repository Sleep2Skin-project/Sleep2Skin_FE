import AppTabs from '@/components/app-tabs';

// HOME/TODO/REPORT/MY 탭 화면들을 이 그룹으로 옮긴 이유: 루트 _layout.tsx가 AppTabs(NativeTabs)를
// 곧바로 렌더하면, NativeTabs의 내부 라우터(TabRouter)는 <NativeTabs.Trigger>로 등록된 탭
// 화면만 알고 있어서 my-model.tsx처럼 탭이 아닌 화면으로는 router.push()가 먹히지 않는다(눌러도
// 페이지가 안 넘어감 — 조용히 무시됨). 탭 화면들을 (tabs) 그룹으로 묶고 my-model.tsx는 그
// 바깥(루트 Stack)에 두면, my-model이 탭 위에 새 화면으로 정상적으로 push된다.
export default function TabsLayout() {
  return <AppTabs />;
}
