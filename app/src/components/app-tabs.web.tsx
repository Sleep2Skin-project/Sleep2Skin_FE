import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';

// 스타터 템플릿의 'Expo Starter' 브랜딩 · Docs 링크가 들어간 플로팅 상단 탭바는
// SKIN 와이어프레임(docs/home.png)에 없는 요소라 제거했다.
// TabTrigger는 <TabList> 안에 있어야 라우트를 등록하므로 화면에는 렌더링하지 않은 채(display: none) 남겨둔다.
// 하단 탭 내비게이션(HOME/TODO/REPORT/MY)은 각 탭 라우트가 준비되면 별도로 구현한다.
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="home" href="/" />
        <TabTrigger name="explore" href="/explore" />
      </TabList>
    </Tabs>
  );
}
