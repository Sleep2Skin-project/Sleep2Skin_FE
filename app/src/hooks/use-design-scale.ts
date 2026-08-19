import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 시연 녹화에 아이폰 16(393pt 폭) 한 기기만 쓰기로 해서, 가로는 더 이상 실행 중인 창 크기를
// 읽지 않고 이 기기 폭을 고정값으로 쓴다 — 예전엔 실제 창 크기를 읽어 "모든 아이폰 규격"에
// 맞추려 했는데, 시뮬레이터 창 크기·웹 프리뷰처럼 디자인 캔버스(402x874, 아이폰 16 Pro 비율)와
// 가로세로 비율이 크게 다른 환경에서 캔버스가 한쪽 구석에 작게 배치되고 남는 공간에 배경색만
// 넓게 칠해져 어색해 보였다. 이제 기기 하나로 고정했으니 그 경우가 없다.
const TARGET_DEVICE_WIDTH = 393;

/**
 * Figma 캔버스(고정 designWidth x designHeight, 기본 402x874)를 아이폰 16 화면에 맞춰
 * 비율 스케일링하기 위한 배율을 계산한다. 내부 좌표/레이아웃은 그대로 두고 캔버스 전체를
 * transform: [{ scale }]로 축소하는 방식으로 써야 한다.
 *
 * designHeight를 주면(고정 높이 화면) 세로도 화면에 맞춰 축소해 하단이 잘리지 않게 하고,
 * 생략하면(콘텐츠 길이가 가변적이고 스크롤로 처리하는 화면) 가로 폭에만 맞춘다.
 *
 * 🚨 measuredContainerHeight를 반드시 같이 넘긴다(캔버스를 담는 SafeAreaView/View에
 * onLayout으로 실측한 높이) — 852(아이폰 16 전체 화면 높이)에서 insets만 빼서 계산하면
 * 틀린다. expo-router의 <NativeTabs>는 진짜 OS 탭바라서 화면 하단 상당 부분(탭바 자체
 * 높이, 약 49pt)을 차지하는데, useSafeAreaInsets()는 노치·홈 인디케이터만 알지 탭바
 * 존재는 전혀 모른다. 그래서 852 기준으로 계산하면 실제보다 넓게 쓸 수 있다고 착각해서
 * 캔버스를 필요 이상으로 키우고, 그 결과 하단 콘텐츠(버튼 아래 안내 문구·화살표 등)가
 * 탭바 뒤로 밀려 들어가 잘려 보였다(docs/아이폰16-2.jpg). onLayout 실측값은 탭바가
 * 차지하는 영역을 이미 제외한 실제 화면 프레임 높이라 이 문제가 없다.
 */
export function useDesignScale(designWidth: number, designHeight?: number, measuredContainerHeight?: number) {
  const insets = useSafeAreaInsets();

  const availableWidth = TARGET_DEVICE_WIDTH - insets.left - insets.right;
  const widthScale = availableWidth / designWidth;
  if (!designHeight) return widthScale;

  // 아직 실측 전(첫 렌더)이면 세로 제약 없이 폭 기준으로만 그려서, 실측 후 스케일이
  // 커지는 쪽으로만 바뀌게 한다(작아지는 쪽으로 바뀌면 순간적으로 눈에 띄게 덜컹인다).
  if (!measuredContainerHeight) return widthScale;

  const availableHeight = measuredContainerHeight - insets.top - insets.bottom;
  return Math.min(widthScale, availableHeight / designHeight);
}
