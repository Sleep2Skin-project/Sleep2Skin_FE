import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 시연 녹화에 아이폰 16(393x852pt) 한 기기만 쓰기로 해서, 더 이상 실행 중인 창 크기
// (useWindowDimensions)를 읽지 않고 이 기기 치수를 고정값으로 쓴다 — 예전엔 실제 창 크기를
// 읽어 "모든 아이폰 규격"에 맞추려 했는데, 시뮬레이터 창 크기·웹 프리뷰처럼 디자인 캔버스
// (402x874, 아이폰 16 Pro 비율)와 가로세로 비율이 크게 다른 환경에서 캔버스가 한쪽 구석에
// 작게 배치되고 남는 공간에 배경색만 넓게 칠해져 어색해 보였다. 이제 기기 하나로 고정했으니
// 그 경우가 없다. 다른 기기 대응이 다시 필요해지면 아래 두 상수를 useWindowDimensions()로
// 되돌리면 된다.
const TARGET_DEVICE_WIDTH = 393;
const TARGET_DEVICE_HEIGHT = 852;

/**
 * Figma 캔버스(고정 designWidth x designHeight, 기본 402x874)를 아이폰 16 화면
 * (393x852pt, 고정)에 맞춰 비율 스케일링하기 위한 배율을 계산한다. 내부 좌표/레이아웃은
 * 그대로 두고 캔버스 전체를 transform: [{ scale }]로 축소하는 방식으로 써야 한다.
 *
 * designHeight를 주면(고정 높이 화면) 세로도 화면에 맞춰 축소해 하단이 잘리지 않게 하고,
 * 생략하면(콘텐츠 길이가 가변적이고 스크롤로 처리하는 화면) 가로 폭에만 맞춘다.
 */
export function useDesignScale(designWidth: number, designHeight?: number) {
  const insets = useSafeAreaInsets();

  const availableWidth = TARGET_DEVICE_WIDTH - insets.left - insets.right;
  const availableHeight = TARGET_DEVICE_HEIGHT - insets.top - insets.bottom;

  const widthScale = availableWidth / designWidth;
  return designHeight ? Math.min(widthScale, availableHeight / designHeight) : widthScale;
}
