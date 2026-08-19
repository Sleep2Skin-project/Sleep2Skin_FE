import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';

// 시연 녹화에 아이폰 16(393x852pt, 상단 다이나믹 아일랜드 세이프에어리어 59pt, 하단 홈
// 인디케이터 34pt) 한 기기만 쓰기로 해서, 이 값들을 고정 상수로 쓴다 — 개발 중 실제 테스트
// 기기(예: 아이폰13, 390x844, 노치 세이프에어리어 ~47pt)가 아이폰16과 다를 수 있는데, 특히
// 아이폰16은 전체 화면은 더 커도(852>844) 다이나믹 아일랜드 때문에 상단 세이프에어리어가
// 더 커서(59>47), 실제 쓸 수 있는 세로 공간은 아이폰16이 오히려 더 좁을 수 있다. 그래서
// "지금 테스트 중인 기기에서 실측한 값"을 그대로 쓰면 안 되고, 아래처럼 아이폰16 값으로
// 환산해야 한다.
const IPHONE16_WIDTH = 393;
const IPHONE16_HEIGHT = 852;
const IPHONE16_TOP_INSET = 59;
const IPHONE16_BOTTOM_INSET = 34;
// measuredContainerHeight를 아직 안 넘기는 화면들(대부분 이 파일 아래 목록)이 쓰는 대략치 —
// 정확하진 않지만(네이티브 탭바 높이를 모른다, 아래 안내 참고) 이 훅을 쓰는 모든 화면을
// onLayout 실측으로 옮기기 전까지는 기존 동작을 그대로 유지하기 위한 값이다.
const FALLBACK_DEVICE_HEIGHT = 852;

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
 *
 * 🚨 실측값을 "이 기기의 남은 공간"이 아니라 "탭바 자체 높이"를 구하는 데만 쓴다 — 탭바
 * 높이(약 49pt)는 기기가 달라져도 거의 일정하지만, 세이프에어리어(특히 상단)는 기기마다
 * 꽤 다르다(아이폰13 ~47pt vs 아이폰16 ~59pt). 그래서 "전체 창 높이 - 실측 렌더 높이"로
 * 탭바 높이만 역산하고, 나머지는 전부 아이폰16 고정값으로 계산해서 "다른 기기로 테스트해도
 * 아이폰16 기준 결과가 나오게" 만든다.
 */
export function useDesignScale(designWidth: number, designHeight?: number, measuredContainerHeight?: number) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const availableWidth = IPHONE16_WIDTH - insets.left - insets.right;
  const widthScale = availableWidth / designWidth;
  if (!designHeight) return widthScale;

  // measuredContainerHeight를 안 넘긴 호출부는 예전처럼 852(고정 상수) 기준으로 계산한다
  // (탭바 높이를 무시하는 부정확한 값이지만, 그 화면들을 개별 검토하기 전까지는 최소한
  // 이전 동작을 그대로 유지해야 한다 — 여기서 fallback을 잘못 바꿨다가 손 안 댄 화면들이
  // 전부 같이 밀리는 회귀가 난 적이 있다).
  if (!measuredContainerHeight) {
    const availableHeight = FALLBACK_DEVICE_HEIGHT - insets.top - insets.bottom;
    return Math.min(widthScale, availableHeight / designHeight);
  }

  const tabBarHeight = windowHeight - measuredContainerHeight;
  const availableHeight = IPHONE16_HEIGHT - IPHONE16_TOP_INSET - IPHONE16_BOTTOM_INSET - tabBarHeight;
  return Math.min(widthScale, availableHeight / designHeight);
}
