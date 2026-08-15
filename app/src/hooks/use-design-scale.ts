import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 실제 기기 대비 너무 크게 확대되는 것을 막는 상한값. 402 기준 최신 iPhone 최대 폭(430, Pro Max)도
// 1.07배라 1.15면 모든 iPhone은 사실상 원본 그대로고, 태블릿/데스크톱 웹 미리보기처럼 아주 넓은
// 뷰포트에서만 상한에 걸려 디자인이 과도하게 커지는 것을 막는다.
const MAX_SCALE = 1.15;

/**
 * Figma 캔버스(고정 designWidth x designHeight, 기본 402x874)를 실제 기기 화면에 맞춰
 * 비율 스케일링하기 위한 배율을 계산한다. 내부 좌표/레이아웃은 그대로 두고 캔버스 전체를
 * transform: [{ scale }]로 확대/축소하는 방식으로 써야 한다.
 *
 * designHeight를 주면(고정 높이 화면) 세로도 화면에 맞춰 축소해 하단이 잘리지 않게 하고,
 * 생략하면(콘텐츠 길이가 가변적이고 스크롤로 처리하는 화면) 가로 폭에만 맞춘다.
 */
export function useDesignScale(designWidth: number, designHeight?: number) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const availableWidth = width - insets.left - insets.right;
  const availableHeight = height - insets.top - insets.bottom;

  const widthScale = availableWidth / designWidth;
  const rawScale = designHeight ? Math.min(widthScale, availableHeight / designHeight) : widthScale;

  return Math.min(rawScale, MAX_SCALE);
}
