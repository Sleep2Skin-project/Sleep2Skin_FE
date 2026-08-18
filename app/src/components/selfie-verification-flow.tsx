import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getSkinModel,
  getVerificationSummary,
  SelfieVerificationApiError,
  SkinModelUserNotFoundError,
  verifySelfie,
  type SelfieVerificationData,
  type SkinModelDetail,
  type VerificationSummary,
  type VerificationVerdict,
} from '@/api/skin';
import { ExpGainPopup } from '@/components/exp-gain-popup';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import {
  NAV_BAR_ACTIVE_COLOR,
  NAV_BAR_ICON_SOURCES,
  NAV_BAR_INACTIVE_COLOR,
  TAB_ITEMS,
  tabBarStyles,
  type TabItem,
} from '@/constants/tabs';
import { Spacing } from '@/constants/theme';
import { useDesignScale } from '@/hooks/use-design-scale';
import { showAlert } from '@/utils/platform-alert';

// HOME-05~14 셀피 검증 플로우 — 1) 촬영 → 2) 분석 중 → 3) 검증 리포트.
// 1단계(촬영, node 176:816 "셀피 화면")·2단계(분석 중, node 176:961 "셀피 로딩 화면")·3단계(리포트,
// node 241:604 "iPhone 17 - 14")는 모두 Figma REST API로 좌표·색상·타이포·에셋을 그대로 옮겼고,
// 부모 테마와 무관하게 항상 Figma가 지정한 배경(1단계 다크 그라디언트 / 2단계 흰 배경 / 3단계
// 연한 파란 배경)으로 렌더한다. 실제 카메라 연동 전이라 촬영 화면은 플레이스홀더 프리뷰를 쓰지만,
// 2단계(분석)·3단계(리포트)는 POST /api/v1/skin/selfie(verifySelfie, HOME-06→07→08) 실응답으로
// 채운다 — 업로드/분석 요청은 SelfieFlowSteps가 소유하고, AnalyzingStep은 그 진행 상태만 표시,
// ReportStep은 그 응답 데이터만 렌더링한다.

// node 176:816 배경(linear-gradient(180deg, #191A28 0%, #0C0D15 100%))
const CAPTURE_BG_TOP = '#191A28';
const CAPTURE_BG_BOTTOM = '#0C0D15';
// "얼굴 위치를 프레임에 맞춥니다" 상태 배지·트래킹 도트·아웃라인에 쓰이는 시안 포인트 컬러.
const CAPTURE_CYAN = '#7EE6FF';
const CAPTURE_CYAN_BORDER = 'rgba(126, 230, 255, 0.9)';
// 트래킹 도트(node 176:853/855/857) 글로우 — Figma boxShadow 값 그대로.
const CAPTURE_DOT_GLOW = '0px 0px 6px 1px rgba(126, 230, 255, 1)';

const AUTO_CAPTURE_SECONDS = 5;
const SCAN_DURATION_MS = 1500;
// "div"(node 176:834) 얼굴 가이드 오벌 크기.
const OVAL_WIDTH = 238;
const OVAL_HEIGHT = 300;

// HOME(index.tsx)·온보딩(onboarding-flow.tsx)과 동일한 고정 프레임 규격.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

// node 176:961 "셀피 로딩 화면" 전용 색상.
const ANALYZING_TEXT_DARK = '#171717'; // Cod Gray — 타이틀/활성 지표 라벨
const ANALYZING_TEXT_MUTED = 'rgba(55, 56, 60, 0.61)'; // Tuna 61% — 서브타이틀
const ANALYZING_TEXT_MUTED_28 = 'rgba(55, 56, 60, 0.28)'; // Tuna 28% — 대기 라벨/뱃지/하단 문구
const ANALYZING_DONE_COLOR = '#00BF40'; // Malachite — "완료" 뱃지
const ANALYZING_ACTIVE_COLOR = '#3366FF'; // Dodger Blue — "진행 중" 뱃지
const ANALYZING_CARD_BORDER = 'rgba(112, 115, 124, 0.22)'; // Pale Sky 22%
const ANALYZING_ROW_DIVIDER = 'rgba(112, 115, 124, 0.08)'; // Pale Sky 8%
const ANALYZING_AVATAR_BG = '#F7F7F8'; // Athens Gray

// 지표 배지 한 칸이 순환하는 주기 — pending 동안 이 주기로 계속 한 바퀴씩 돈다(고정 총 소요시간 아님).
const METRIC_STEP_DURATION_MS = 1250;
// 응답 도착 후 배지를 전부 완료 상태로 보여주고 나서 리포트로 넘어가기까지의 여운.
const REPORT_TRANSITION_DELAY_MS = 400;

type MetricStatus = 'pending' | 'active' | 'done';

const METRIC_ITEMS = [
  { key: 'barrier', label: '장벽 측정' },
  { key: 'oil', label: '유분 측정' },
  { key: 'darkCircle', label: '다크서클 측정' },
  { key: 'compare', label: '어제 예보와 대조' },
] as const;

// node 241:604 "iPhone 17 - 14 (검증 리포트)"의 비교 테이블(node 243:1683)은 verifySelfie 응답의
// verifications 배열(항상 1개 이상, 최대 3개)을 행으로 그린다. 지표별 게이지 바(트랙+진행색+동그란
// 마커)가 Figma에서 행마다 다른 색의 플랫 벡터로 미리 그려져 있어, 값으로부터 동적으로 계산하는
// 대신 행 순서에 맞춰 에셋을 그대로 사용한다(값 크기와 무관한 장식용 자산).
const COMPARISON_GAUGE_ASSETS = [
  require('@/assets/images/figma-icon-report-gauge-1.png'),
  require('@/assets/images/figma-icon-report-gauge-2.png'),
  require('@/assets/images/figma-icon-report-gauge-3.png'),
] as const;

// verifications/skipped의 metric 필드(DARK_CIRCLE/BARRIER/COMPLEXION 등) → 표시 라벨.
// 이 비교 테이블(node 618:1656의 618:1678/1692/1706)은 "예보 대비 실측"을 보여주는 맥락이라
// index.tsx/daily-report.tsx의 피부 예보 라벨과는 별도로, Figma가 이 화면 전용으로 지정한 문구를
// 그대로 쓴다.
const VERIFICATION_METRIC_LABELS: Record<string, string> = {
  DARK_CIRCLE: '다크서클 회복',
  BARRIER: '피부 장벽',
  COMPLEXION: '혈색',
};

function metricLabel(metric: string): string {
  return VERIFICATION_METRIC_LABELS[metric] ?? metric;
}

// verdict(HIT/CLOSE/UNDERESTIMATED/OVERESTIMATED)는 서버가 이미 판정까지 끝낸 결과라, 프론트는
// 임계값을 다시 계산하지 않고 그대로 아이콘/라벨에 매핑만 한다. 에셋은 ok/warn 2종뿐이라
// HIT·CLOSE는 ok로, UNDER/OVERESTIMATED는 warn으로 묶는다.
const VERDICT_ICON_SOURCES: Record<VerificationVerdict, number> = {
  HIT: require('@/assets/images/figma-icon-report-verdict-ok.png'),
  CLOSE: require('@/assets/images/figma-icon-report-verdict-ok.png'),
  UNDERESTIMATED: require('@/assets/images/figma-icon-report-verdict-warn.png'),
  OVERESTIMATED: require('@/assets/images/figma-icon-report-verdict-warn.png'),
};

const VERDICT_LABELS: Record<VerificationVerdict, string> = {
  HIT: '적중',
  CLOSE: '근접',
  UNDERESTIMATED: '과소예측',
  OVERESTIMATED: '과대예측',
};

// AccuracyCard(적중률·연속 검증 배너, HOME-09)에 그리는 스트릭 체크 배지 최대 개수 — streakCount가
// 이보다 크면 나머지는 배지로 그리지 않고 타이틀 텍스트의 숫자로만 표시한다(공간 제약).
const STREAK_BADGE_MAX = 5;

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// node 241:604 "iPhone 17 - 14 (검증 리포트)" 전용 색상.
const REPORT_BG = '#DFEAFF';
const REPORT_TEXT_DARK = '#1A1A1A';
// 비교 테이블 라벨·실측값, 인사이트 타이틀 전용 (Figma "Cod Gray (105:423)") — 헤더/메인 타이틀의
// Cod Gray(#1A1A1A)와는 미세하게 다른 별도 토큰이라 구분해서 쓴다.
const REPORT_TEXT_DARKEST = '#171717';
const REPORT_TEXT_MUTED = '#8B8B93'; // Manatee
const REPORT_BLUE = '#3366FF';
const REPORT_NAVY = '#031949';
const REPORT_DOLPHIN = '#6B6478';
const REPORT_TARA_BG = '#E1F6EB';
const REPORT_MEADOW = '#1FAA6A';
// 적중률 링 "+6%p" 델타 필의 음수(하락) 버전 — Figma엔 상승(+) 케이스만 있어 별도 지정이 없다.
// 이 파일에서 이미 "실패/경고"에 쓰는 빨강(STREAK_MODAL_DAY_FAILED_BORDER, #F91D33)과 톤을
// 맞추고, 배경은 REPORT_TARA_BG와 같은 방식(10% 틴트)으로 만들었다.
const REPORT_DELTA_DOWN_BG = 'rgba(249, 29, 51, 0.1)';
const REPORT_DELTA_DOWN_TEXT = '#F91D33';
const REPORT_TABLE_BORDER = 'rgba(112, 115, 124, 0.22)'; // Pale Sky 22%
const REPORT_TABLE_DIVIDER = 'rgba(112, 115, 124, 0.08)'; // Pale Sky 8%
const REPORT_HEADER_LABEL = 'rgba(55, 56, 60, 0.28)'; // Tuna 28%
const REPORT_VALUE_MUTED = 'rgba(55, 56, 60, 0.61)'; // Tuna 61%
const REPORT_SPARKLE_BG = 'rgba(0, 102, 255, 0.1)'; // Blue Ribbon 10%

// node 618:1938(느슨한 그룹, Figma 캔버스에 프레임 없이 떠 있는 최신 시안) — "셀피 리포트 팝업"
// 모달의 리디자인. 예전 시안(node 487:273 > 487:543, "아차! 연속 출석에 실패했어요")은 요일별
// 완료/실패/예정 3가지 상태를 보여줬는데, 그 배열을 내려주는 API가 없어(GET
// /api/v1/skin/verification/summary는 streakCount 정수 하나와 최근 1건만 내려줄 뿐, "일자별
// 이력"이나 "이어서 재개" 개념 자체가 백엔드에 없다) 전부 정적 목업이었다.
// 새 시안은 "실패" 상태를 아예 없애고 완료 1칸 + 목표(5일) 4칸, CTA 버튼 1개(기존 2개 → 1개)로
// 단순화했다 — 그 덕에 streakCount 정수 하나만으로 완전히 실연동된다: 검증 직후 streakCount가
// 1이면(오늘 새로 1일차를 시작한 것 — 최초 검증이든 스트릭이 끊긴 뒤 재시작이든 서버 입장에서는
// 구분할 방법이 없어 동일하게 취급) 이 모달을 띄우고, 항상 "완료 1칸 + 5일 4칸"만 보여준다
// (streakCount가 2 이상이면 이미 진행 중인 스트릭이므로 이 모달 자체를 띄우지 않는다 — 중간
// 진행 상태를 보여주는 시안이 아니다).
// "실패" 상태의 얼굴 에셋(figma-icon-my-streak-face-cry.png)·색상(STREAK_MODAL_DAY_FAILED_BORDER)·
// 스타일(streakModalDayCircleFailed 등)은 나중에 백엔드가 일자별 이력을 내려주기 시작하면 바로 쓸 수
// 있게 준비만 해뒀다 — 지금 이 파일 어디서도 조건부로 렌더링하지 않는다(위 이유와 동일).
const STREAK_MODAL_BACKDROP = 'rgba(255, 255, 255, 0.4)';
const STREAK_MODAL_TITLE = '#000000';
const STREAK_MODAL_SUBTITLE = '#525252';
const STREAK_MODAL_PANEL_BG = 'rgba(209, 234, 255, 0.6)';
const STREAK_MODAL_DAY_DONE_BG = '#8ECDFF';
const STREAK_MODAL_DAY_DONE_BORDER = '#058BFC';
const STREAK_MODAL_DAY_PENDING_BORDER = '#949597';
// "실패" 상태(node 694:2150/2151, Figma 파일 9c7nKnuMLNcGYC33lmX8Im) 색상 — 위 주석대로 지금은
// 이 상태를 실제로 띄울 일자별 데이터가 없어 스타일/에셋만 준비해두고 렌더링에는 아직 안 쓴다.
const STREAK_MODAL_DAY_FAILED_BORDER = '#F91D33';
const STREAK_MODAL_MARKER = '#008DFF';
const STREAK_MODAL_PRIMARY_BTN_BG = '#008DFF';
// 목표 일수(카드 안 "5일" 라벨과 동일한 값) — 진행 중 4칸의 라벨 문구에도 그대로 쓴다.
const STREAK_CHALLENGE_GOAL_DAYS = 5;

// 이 파일 대부분의 텍스트는 시스템 폰트로도 크게 문제없이 맞았지만, 이 모달의 타이틀("아차! 연속
// 출석에 실패했어요")은 박스 폭이 좁아 시스템 폰트로는 두 줄로 넘칠 수 있다 — 온보딩
// (onboarding-flow.tsx)·출석 화면(attendance-flow.tsx)에서 이미 겪은 것과 동일한 문제라, 같은
// Pretendard 폰트 파일을 이 모달에만 재사용한다.
const PRETENDARD_REGULAR = 'Pretendard-Regular';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const STREAK_MODAL_FONTS = {
  [PRETENDARD_REGULAR]: require('@/assets/fonts/Pretendard-Regular.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
};


// 개발자용 프리패스(Bypass) — 웹 브라우저는 실기기 카메라/갤러리가 온전히 동작하지 않을 수
// 있어, 화면 전환 흐름만 먼저 검증할 수 있도록 실패 시 이 더미 이미지로 강제 진행한다.
const DEV_BYPASS_DUMMY_URI = 'https://dummyimage.com/600x400/000/fff&text=Mock+Selfie';

// 더미 이미지는 실제 얼굴이 아니라 서버 분석(POST /api/v1/skin/selfie)이 항상 실패하므로,
// 프리패스 경로에서는 실제 API를 호출하는 대신 아래 더미 데이터로 3단계(ReportStep) UI만
// 확인할 수 있게 한다 — "웹에서는 페이지 UI만 확인하면 된다"는 용도.
const DEV_BYPASS_MOCK_DELAY_MS = 2500;

function createDevBypassMockVerificationData(): SelfieVerificationData {
  const today = getTodayDateString();
  return {
    baseDate: today,
    analyzedAt: new Date().toISOString(),
    verifications: [
      { metric: 'DARK_CIRCLE', forecast: { score: 78, grade: '양호' }, measured: { score: 74, grade: '양호' }, difference: 4, verdict: 'HIT' },
      { metric: 'BARRIER', forecast: { score: 65, grade: '보통' }, measured: { score: 52, grade: '주의' }, difference: 13, verdict: 'CLOSE' },
      { metric: 'COMPLEXION', forecast: { score: 82, grade: '양호' }, measured: { score: 60, grade: '보통' }, difference: 22, verdict: 'OVERESTIMATED' },
    ],
    skipped: [],
    hitRate: 33,
    model: {
      updated: true,
      message: '개발자 프리패스로 만든 더미 데이터예요 — 실제 분석 결과가 아니에요.',
      changes: [],
    },
    streakCount: 3,
    exp: {
      gained: 10,
      reasons: [{ reason: 'VERIFICATION_STREAK', amount: 10 }],
      totalExp: 320,
      level: 3,
      levelUp: false,
      nextLevelExp: 450,
    },
  };
}

function CornerBracket({ position }: { position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' }) {
  return <View style={[styles.cornerBracket, cornerPositionStyles[position]]} />;
}

// 카메라 프리뷰 실기기 연동 전까지 사용하는 플레이스홀더 — HOME-06 전면 카메라 프리뷰 자리.
// node 176:834("div", 238x300) 하위 레이어를 좌표 그대로 옮겼다: 오벌 페이스 가이드(176:835) +
// 바깥 점선 글로우 링(176:848) + 4개 코너 브래킷(176:849~852) + 3개 트래킹 도트(176:853/855/857).
function CapturePreview({
  scanning,
  scanTranslateY,
  cameraRef,
  cameraReady,
  permissionChecked,
}: {
  scanning: boolean;
  scanTranslateY: Animated.AnimatedInterpolation<number>;
  cameraRef: RefObject<CameraView | null>;
  cameraReady: boolean;
  permissionChecked: boolean;
}) {
  return (
    <View style={styles.previewWrap}>
      <View style={styles.previewOuterRing} />

      <CornerBracket position="topLeft" />
      <CornerBracket position="topRight" />
      <CornerBracket position="bottomLeft" />
      <CornerBracket position="bottomRight" />

      <View style={styles.oval}>
        {cameraReady && <CameraView ref={cameraRef} style={styles.cameraFill} facing="front" />}
        <View style={styles.ovalGray8Overlay} />
        <View style={styles.ovalDashedRing} />

        {!cameraReady && (
          <View style={styles.ovalPlaceholderContent}>
            <Image
              source={require('@/assets/images/figma-icon-selfie-preview-placeholder.png')}
              style={styles.ovalPlaceholderGlyph}
              contentFit="contain"
            />
            <Text style={styles.ovalPlaceholderText}>
              {permissionChecked ? '카메라 접근 권한이 필요해요' : '카메라 미리보기 (사용자 얼굴)'}
            </Text>
          </View>
        )}

        {scanning && (
          <Animated.View
            pointerEvents="none"
            style={[styles.scanBarWrap, { transform: [{ translateY: scanTranslateY }] }]}>
            <View style={styles.scanGlow} />
            <View style={styles.scanLine} />
          </Animated.View>
        )}
      </View>

      {/* 트래킹 도트 3개(node 176:853/855/857) — Figma 레이어 순서상 오벌보다 위(가장 앞)라
          카메라 프리뷰 위에 떠 보여야 한다. 오벌(불투명 배경) 뒤에 두면 완전히 가려지므로
          previewWrap의 마지막 자식으로 그려야 한다. */}
      <View pointerEvents="none" style={styles.ovalGuideDotA} />
      <View pointerEvents="none" style={styles.ovalGuideDotB} />
      <View pointerEvents="none" style={styles.ovalGuideDotC} />
    </View>
  );
}

function CaptureStep({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  onCaptured: (imageUri: string) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CAPTURE_SECONDS);
  const [scanning, setScanning] = useState(false);
  const [scanAnim] = useState(() => new Animated.Value(0));
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const isWeb = Platform.OS === 'web';

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [libraryPermission, requestLibraryPermission] = ImagePicker.useMediaLibraryPermissions();
  // 웹은 브라우저 카메라 권한 팝업(getUserMedia)을 유도하지 않고 항상 더미로 우회한다.
  const cameraReady = !isWeb && cameraPermission?.granted === true;
  // 5초 자동촬영 카운트다운(아래 useEffect)은 마운트 시점에 한 번만 설정되는 setInterval이라,
  // 그 콜백이 직접 참조하는 cameraReady는 마운트 당시의 스냅샷(대개 권한 확인 전 false)에
  // 그대로 고정돼버린다 — 이후 사용자가 권한을 허용해도 타이머는 그 사실을 영영 못 본다.
  // ref는 렌더와 무관하게 항상 최신값을 담고 있으므로, capturePhoto가 이 ref를 읽게 하면
  // 타이머가 언제 끝나든 "지금" 권한 상태를 정확히 참조한다.
  const cameraReadyRef = useRef(cameraReady);
  useEffect(() => {
    cameraReadyRef.current = cameraReady;
  }, [cameraReady]);

  // 최초 진입 시 카메라·앨범 권한을 한 번 확인하고, 아직 받지 않았다면(그리고 다시 물어볼 수
  // 있다면) 요청한다. 이미 허용/영구 거부된 상태라면 재요청하지 않는다. 웹에서는 어차피
  // 카메라를 쓰지 않으므로 카메라 권한은 요청하지 않는다.
  useEffect(() => {
    if (!isWeb && cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      requestCameraPermission();
    }
    if (libraryPermission && !libraryPermission.granted && libraryPermission.canAskAgain) {
      requestLibraryPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPermission?.granted, cameraPermission?.canAskAgain, libraryPermission?.granted, libraryPermission?.canAskAgain]);

  // 카메라 촬영과 갤러리 선택 결과(uri)를 동일하게 처리하는 공통 진입점. 실제 업로드/분석
  // (verifySelfie) 호출은 다음 화면 진입을 소유한 SelfieFlowSteps가 담당하므로, 여기서는 uri가
  // 실제 촬영본이든 개발자 프리패스로 만든 더미든 상관없이 그대로 다음 화면(step 2, AnalyzingStep
  // = "셀피 로딩 화면")으로 넘긴다.
  const handleImageSelected = async (uri: string) => {
    onCaptured(uri);
  };

  // 개발자용 프리패스 — 실기기 촬영/갤러리 선택이 실패하거나 웹 환경이라 애초에 시도할 수
  // 없을 때, 화면 전환 흐름 테스트가 막히지 않도록 더미 이미지로 강제 진행한다.
  const bypassWithDummyImage = async (reason: string) => {
    showAlert('개발자 프리패스', `${reason} 더미 이미지로 다음 화면까지 진행할게요.`);
    await handleImageSelected(DEV_BYPASS_DUMMY_URI);
  };

  const capturePhoto = async () => {
    if (isWeb || !cameraReadyRef.current) {
      await bypassWithDummyImage(isWeb ? '웹 환경에서는 카메라를 사용할 수 없어' : '카메라 권한이 없어');
      return;
    }
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        await handleImageSelected(photo.uri);
      } else {
        await bypassWithDummyImage('촬영된 사진을 가져오지 못해');
      }
    } catch {
      await bypassWithDummyImage('촬영에 실패해');
    }
  };

  const openGallery = async () => {
    if (isWeb) {
      await bypassWithDummyImage('웹 환경에서는 갤러리 접근 대신');
      return;
    }
    try {
      let permission = libraryPermission;
      if (!permission?.granted) {
        permission = await requestLibraryPermission();
      }
      if (!permission?.granted) {
        await bypassWithDummyImage('앨범 접근 권한이 없어');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      // 사용자가 스스로 취소한 경우는 실패가 아니므로 우회하지 않고 그대로 화면에 머문다.
      if (!result.canceled && result.assets[0]?.uri) {
        await handleImageSelected(result.assets[0].uri);
      }
    } catch {
      await bypassWithDummyImage('갤러리에서 이미지를 가져오지 못해');
    }
  };

  const startCapture = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setScanning(true);
    scanAnim.setValue(0);
    Animated.timing(scanAnim, {
      toValue: 1,
      duration: SCAN_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) capturePhoto();
    });
  };

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          startCapture();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, OVAL_HEIGHT - 4],
  });

  return (
    <View style={styles.captureContainer}>
      {/* "div"(node 176:817, padding:68px 22px 0px) — 닫기 아이콘(176:820) + 라벨(176:822) */}
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={({ pressed }) => [styles.captureHeaderRow, pressed && styles.pressed]}>
        <Image
          source={require('@/assets/images/figma-icon-selfie-close.png')}
          style={styles.captureCloseIcon}
          contentFit="contain"
        />
        <Text style={styles.captureCloseText}>닫기</Text>
      </Pressable>

      <View style={styles.captureBody}>
        <View style={styles.captureCopy}>
          <Text style={styles.captureTitle}>밝은 곳에서 정면을 바라봐 주세요</Text>
          <Text style={styles.captureSubtitle}>얼굴이 가이드에 맞춰지면 자동으로 촬영돼요</Text>
        </View>

        <CapturePreview
          scanning={scanning}
          scanTranslateY={scanTranslateY}
          cameraRef={cameraRef}
          cameraReady={cameraReady}
          permissionChecked={!isWeb && cameraPermission != null}
        />

        {/* 상태 배지 (node 176:859/864, 단일 pill) */}
        <View style={styles.statusPill}>
          <View style={styles.statusPillDot} />
          <Text style={styles.statusPillText}>얼굴 위치를 프레임에 맞춥니다</Text>
        </View>
      </View>

      <View style={styles.captureFooter}>
        <Text style={styles.autoCaptureText}>
          {scanning ? '촬영 중…' : `${secondsLeft}초 후 자동 촬영`}
        </Text>
        <View style={styles.captureControlsRow}>
          {/* 갤러리(앨범) 백업 버튼 — 촬영 대신 기존 사진을 선택해 동일한 handleImageSelected로 넘긴다. */}
          <Pressable
            onPress={openGallery}
            disabled={scanning}
            hitSlop={12}
            style={({ pressed }) => [styles.galleryButton, pressed && styles.pressed]}>
            <Image
              source={require('@/assets/images/figma-icon-selfie-preview-placeholder.png')}
              style={styles.galleryButtonIcon}
              contentFit="contain"
            />
          </Pressable>

          {/* 셔터 버튼 (node 176:873, 72x72) — 흰 원(176:874) + 링 에셋(176:875) 오버레이 */}
          <Pressable
            onPress={startCapture}
            disabled={scanning}
            style={({ pressed }) => [styles.shutterButton, (pressed || scanning) && styles.pressed]}>
            <View style={styles.shutterInner} />
            <Image
              source={require('@/assets/images/figma-icon-selfie-shutter-ring.png')}
              style={styles.shutterRing}
              contentFit="contain"
            />
          </Pressable>

          {/* 셔터 버튼을 시각적으로 중앙에 두기 위한 갤러리 버튼과 동일 크기의 스페이서. */}
          <View style={styles.captureControlsSpacer} />
        </View>
        <Text style={styles.captureDisclaimer}>촬영 원본은 저장되지 않습니다</Text>
      </View>
    </View>
  );
}

// node 176:963("div", 132x132) — 아바타 원(176:964) + 바깥 회전 링 에셋(176:977) + 트래킹 도트 3개(176:978/980/982).
// imageUri가 있으면(촬영/갤러리로 얻은 실제 사진) 원 안에 그 사진을 채우고, 없으면(예: 웹 환경
// 프리패스 등) 기존 회색 아이콘 + "촬영된 셀피" 텍스트 Fallback UI를 그대로 보여준다. 바깥 점선
// 회전 링(selfieRotatingRingWrap)은 이 조건과 무관하게 항상 그대로 렌더된다.
function RotatingSelfieBadge({ rotateAnim, imageUri }: { rotateAnim: Animated.Value; imageUri: string | null }) {
  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.selfieBadgeWrap}>
      {/* 아바타 원 (node 176:964, x:6 y:6 w:120 h:120, fill: Athens Gray, radius:60) */}
      <View style={styles.selfieAvatarCircle}>
        <View style={styles.selfieAvatarOverlay} />
        <View style={styles.selfieAvatarDashedRing} />
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.selfieAvatarPhoto} contentFit="cover" />
        ) : (
          <View style={styles.selfieAvatarContent}>
            <Image
              source={require('@/assets/images/figma-icon-analyzing-preview-placeholder.png')}
              style={styles.selfieAvatarGlyph}
              contentFit="contain"
            />
            <Text style={styles.selfieAvatarText}>촬영된 셀피</Text>
          </View>
        )}
      </View>

      {/* 바깥 회전 링 에셋 (node 176:977, 132x132) */}
      <Animated.View style={[styles.selfieRotatingRingWrap, { transform: [{ rotate }] }]}>
        <Image
          source={require('@/assets/images/figma-icon-analyzing-ring.png')}
          style={styles.selfieRotatingRing}
          contentFit="contain"
        />
      </Animated.View>

      {/* 트래킹 도트 3개 (node 176:978/980/982, 7x7 + 흰 3px 헤일로) */}
      <View style={[styles.selfieOrbitHalo, styles.selfieOrbitHaloA]}>
        <View style={styles.selfieOrbitDot} />
      </View>
      <View style={[styles.selfieOrbitHalo, styles.selfieOrbitHaloB]}>
        <View style={styles.selfieOrbitDot} />
      </View>
      <View style={[styles.selfieOrbitHalo, styles.selfieOrbitHaloC]}>
        <View style={styles.selfieOrbitDot} />
      </View>
    </View>
  );
}

// 지표 행 우측 상태 뱃지 (node 176:993/1001/1009/1016) — 완료(체크 아이콘)/진행 중(스피너)/대기(모래시계 아이콘).
function MetricStatusBadge({ status }: { status: MetricStatus }) {
  if (status === 'done') {
    return (
      <View style={styles.metricStatusRow}>
        <Image
          source={require('@/assets/images/figma-icon-analyzing-done.png')}
          style={styles.metricDoneIcon}
          contentFit="contain"
        />
        <Text style={styles.metricDoneLabel}>완료</Text>
      </View>
    );
  }
  if (status === 'active') {
    return (
      <View style={[styles.metricStatusRow, styles.metricStatusRowActive]}>
        <ActivityIndicator size="small" color={ANALYZING_ACTIVE_COLOR} />
        <Text style={styles.metricActiveLabel}>진행 중</Text>
      </View>
    );
  }
  return (
    <View style={styles.metricStatusRow}>
      <Image
        source={require('@/assets/images/figma-icon-analyzing-pending.png')}
        style={styles.metricPendingIcon}
        contentFit="contain"
      />
      <Text style={styles.metricPendingLabel}>대기</Text>
    </View>
  );
}

// node 176:961 "셀피 로딩 화면" — 부모 테마와 무관하게 항상 Figma 지정 흰 배경으로 렌더한다.
// imageUri는 CaptureStep에서 촬영/선택한 사진 경로로, 중앙 원형 배지 미리보기에 쓰인다.
// 실제 verifySelfie 요청은 SelfieFlowSteps가 보내고, 이 컴포넌트는 그 진행 상태(pending)만
// 받아 순수하게 화면을 그린다. 502/504는 verifySelfie 내부에서 이미 1회 자동 재시도되므로
// 5초를 넘길 수 있다 — 그래서 지표 배지를 고정 타임라인 한 번으로 끝내는 대신, pending인 동안
// 계속 한 바퀴씩 돌려(끊겨 보이지 않게) 응답이 오면(pending=false) 즉시 전부 완료로 스냅한다.
function AnalyzingStep({ imageUri, pending }: { imageUri: string | null; pending: boolean }) {
  const [statuses, setStatuses] = useState<MetricStatus[]>(() => METRIC_ITEMS.map((_, i) => (i === 0 ? 'active' : 'pending')));
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [rotateAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pending) {
      setStatuses(METRIC_ITEMS.map(() => 'done'));
      return;
    }

    let cycleIndex = 0;
    setStatuses(METRIC_ITEMS.map((_, i) => (i === 0 ? 'active' : 'pending')));

    const cycleTimer = setInterval(() => {
      cycleIndex = (cycleIndex + 1) % METRIC_ITEMS.length;
      setStatuses(
        METRIC_ITEMS.map((_, i) => {
          if (i === cycleIndex) return 'active';
          if (cycleIndex === 0) return 'pending';
          return i < cycleIndex ? 'done' : 'pending';
        }),
      );
    }, METRIC_STEP_DURATION_MS);

    return () => clearInterval(cycleTimer);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const secondsTimer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(secondsTimer);
  }, [pending]);

  return (
    <View style={styles.analyzingContainer}>
      {/* "div"(node 176:962, padding:56px 24px 0px, gap:20) — 배지/제목그룹/카드를 세로 중앙 정렬. */}
      <View style={styles.analyzingCenterGroup}>
        <RotatingSelfieBadge rotateAnim={rotateAnim} imageUri={imageUri} />

        {/* "div"(node 176:984, gap:5) */}
        <View style={styles.analyzingTitleGroup}>
          <Text style={styles.analyzingTitle}>피부 지표를 읽는 중</Text>
          <Text style={styles.analyzingSubtitle}>
            {pending ? `${secondsElapsed}초째 분석 중이에요` : '분석 완료!'}
          </Text>
        </View>

        {/* 지표 카드 (node 176:989, w:334, radius:16, border: Pale Sky 22%) */}
        <View style={styles.metricList}>
          {METRIC_ITEMS.map((item, index) => {
            const status = statuses[index];
            return (
              <View
                key={item.key}
                style={[styles.metricRow, index < METRIC_ITEMS.length - 1 && styles.metricRowDivided]}>
                <Text style={status === 'pending' ? styles.metricLabelPending : styles.metricLabel}>
                  {item.label}
                </Text>
                <MetricStatusBadge status={status} />
              </View>
            );
          })}
        </View>
      </View>

      {/* "div"(node 176:1021, padding:0px 28px 40px, gap:2) */}
      <View style={styles.analyzingFooter}>
        <Text style={styles.analyzingFooterTextPrimary}>분석이 끝나는 즉시 원본 사진은 폐기됩니다.</Text>
        <Text style={styles.analyzingFooterTextSecondary}>서버에는 숫자 지표만 남습니다.</Text>
      </View>
    </View>
  );
}

// ⚠️ 임시방편(TEMP) — "+N%p" 델타 필의 데이터 소스. 나중에 바뀔 수 있으니 이 블록을 건드릴 일이
// 생기면 아래 배경부터 읽을 것.
//
// 서버(GET /api/v1/skin/verification/summary)는 "지금 이 순간의 누적 적중률"만 줄 뿐, "예전엔
// 얼마였는지"(추세)는 아예 안 내려준다. 그래서 "지난번에 이 화면을 본 시점의 누적 적중률"을 이
// 기기(AsyncStorage)에 직접 저장해뒀다가, 다음에 볼 때 지금 값과 비교해서 델타를 만든다.
// 이 방식의 한계(둘 다 알고 있어야 함):
// - 계정이 아니라 "이 기기"에 저장된다 — 다른 기기/재설치/앱 데이터 삭제 시 기준값이 사라져서
//   그 다음 방문에서 델타가 다시 안 뜬다(첫 방문과 동일하게 취급).
// - 이 화면을 실제로 "본" 시점만 스냅샷으로 남는다 — 백엔드에 과거 데이터를 통째로 시딩해도,
//   시딩 이후 이 기기로 최초 한 번 열기 전까지는 비교 기준이 없다.
// 서버가 나중에 "직전 대비 변화량" 또는 기간별 누적 적중률 스냅샷을 내려주기 시작하면, 이 로컬
// 저장 로직은 통째로 걷어내고 서버 값을 쓰는 게 맞다.
const HIT_RATE_SNAPSHOT_STORAGE_KEY = `skin:accuracy-hit-rate-snapshot:${TEMP_USER_ID}`;

// 저장된 이전 누적 적중률을 읽어 델타를 계산하고, 그 자리에 지금 값을 다시 저장해 다음 방문의
// 기준으로 삼는다. 저장된 값이 없으면(최초 방문이거나 기기가 바뀌었으면) null을 돌려줘서
// 호출부가 델타 필 자체를 숨기게 한다 — "0%p"로 보여주면 마치 변화가 없었다는 뜻으로 오해된다.
// 스토리지 읽기/쓰기가 실패해도(권한 문제 등) 조용히 null로 폴백한다 — 델타는 부가 정보라
// 이것 때문에 리포트 화면 전체가 에러로 빠지면 안 된다.
async function readAndUpdateHitRateSnapshot(currentHitRate: number): Promise<number | null> {
  try {
    const stored = await AsyncStorage.getItem(HIT_RATE_SNAPSHOT_STORAGE_KEY);
    await AsyncStorage.setItem(HIT_RATE_SNAPSHOT_STORAGE_KEY, String(currentHitRate));
    if (stored === null) return null;
    const previousHitRate = Number(stored);
    return Number.isNaN(previousHitRate) ? null : currentHitRate - previousHitRate;
  } catch (error) {
    console.error('❌ 적중률 스냅샷 읽기/쓰기 실패:', error);
    return null;
  }
}

type AccuracyBannerState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no_verification'; message: string | null }
  | { kind: 'available'; baseDate: string; summary: VerificationSummary; hitRateDelta: number | null };

// "84% 예보 적중률" 링 + "N일 연속 검증 완료!" 스트릭 배지 (node 618:1656 리디자인 — 예전
// node 243:1507 대비 스트릭 배지가 StreakChallengeModal과 똑같은 모양(얼굴 아이콘 원형 배지 +
// "완료" 라벨, 전부 #8ECDFF/#058BFC)으로 통일됐다. 카드도 단색 배경(#F4F0FD)에서 흰 배경 +
// #058BFC 테두리로 바뀌었다).
// GET /api/v1/skin/verification/summary(HOME-09)를 직접 호출해 채운다 — 데이터 소스는 그대로다.
// - 링 중앙 수치는 summary.hitRate(누적 적중률). summary.latest.hitRate(그날치)와는 다른 숫자라
//   섞어 쓰지 않고 "최근 검증 N%" 배지로 따로 보여준다.
// - 스트릭 배지 개수는 summary.streakCount를 그대로 쓴다. 예전엔 "오늘" 배지만 별 아이콘 +
//   다른 배경색으로 구분했지만, 새 시안은 모든 배지를 동일하게 그리고 마지막(오늘) 배지 위에
//   작은 포인터 마커만 얹는 방식으로 단순화했다 — "오늘"은 응답의 baseDate(요청한 오늘 날짜)와
//   summary.latest.baseDate가 같을 때만 표시한다(오늘 아직 검증하지 않았는데도 마커를 붙이면
//   하지 않은 일을 한 것처럼 보이게 된다).
function AccuracyCard() {
  const [state, setState] = useState<AccuracyBannerState>({ kind: 'loading' });

  useEffect(() => {
    const baseDate = getTodayDateString();

    getVerificationSummary(TEMP_USER_ID, baseDate)
      .then(async ({ data }) => {
        if (data.status !== 'AVAILABLE') {
          setState({ kind: 'no_verification', message: data.message });
          return;
        }
        const hitRateDelta = await readAndUpdateHitRateSnapshot(data.summary.hitRate);
        setState({ kind: 'available', baseDate: data.baseDate, summary: data.summary, hitRateDelta });
      })
      .catch((error) => {
        if (error instanceof SkinModelUserNotFoundError) {
          console.error(`❌ 적중률 배너 조회 실패: 존재하지 않는 사용자 (userId: ${error.userId})`);
        } else {
          console.error('❌ 적중률 배너 조회 실패:', error);
        }
        setState({ kind: 'error' });
      });
  }, []);

  if (state.kind === 'loading') {
    return (
      <View style={[styles.accuracyCard, styles.accuracyCardCentered]}>
        <ActivityIndicator size="small" color={REPORT_BLUE} />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={[styles.accuracyCard, styles.accuracyCardCentered]}>
        <Text style={styles.accuracyEmptyText}>적중률 정보를 불러오지 못했어요</Text>
      </View>
    );
  }

  if (state.kind === 'no_verification') {
    return (
      <View style={[styles.accuracyCard, styles.accuracyCardCentered]}>
        <Text style={styles.accuracyEmptyTitle}>아직 검증 이력이 없어요</Text>
        <Text style={styles.accuracyEmptyText}>
          {state.message ?? '셀피로 첫 검증을 마치면 적중률과 연속 기록이 여기 쌓여요'}
        </Text>
      </View>
    );
  }

  const { summary, baseDate, hitRateDelta } = state;
  const todayInStreak = summary.streakCount > 0 && summary.latest.baseDate === baseDate;
  const totalBadges = Math.min(summary.streakCount, STREAK_BADGE_MAX);
  // "+6%p" 델타 필(node 618:1737) — hitRateDelta는 위 readAndUpdateHitRateSnapshot(임시방편, 그
  // 함수 선언부 주석 참고)이 계산한 "지난 방문 대비 누적 적중률 변화"다. 저장된 기준값이 없으면
  // (최초 방문 등) null이 오는데, 이땐 "0%p"로 얼버무리지 않고 필 자체를 렌더링하지 않는다.
  const hitRateDeltaView =
    hitRateDelta === null
      ? null
      : { label: `${hitRateDelta > 0 ? '+' : ''}${hitRateDelta}%p`, isDown: hitRateDelta < 0 };
  const streakTitle =
    summary.streakCount === 0
      ? '오늘부터 연속 검증을 시작해보세요'
      : todayInStreak
        ? `${summary.streakCount}일 연속 검증 완료!`
        : `${summary.streakCount}일 연속 검증 중 · 오늘도 이어가 볼까요?`;

  return (
    <View style={styles.accuracyCard}>
      <View style={styles.accuracyTopRow}>
        {/* 원형 링 + 중앙 수치 (node 618:1728, 112.67x112.67) */}
        <View style={styles.accuracyRingWrap}>
          <Image
            source={require('@/assets/images/figma-icon-report-ring.png')}
            style={styles.accuracyRingImage}
            contentFit="contain"
          />
          <View style={styles.accuracyRingContent}>
            <View style={styles.accuracyRateRow}>
              <Text style={styles.accuracyRateText}>{summary.hitRate}</Text>
              <Text style={styles.accuracyRatePercent}>%</Text>
            </View>
            <Text style={styles.accuracyRateLabel}>예보 적중률</Text>
            {hitRateDeltaView !== null && (
              <View style={[styles.accuracyDeltaPill, hitRateDeltaView.isDown && styles.accuracyDeltaPillDown]}>
                <Text style={[styles.accuracyDeltaText, hitRateDeltaView.isDown && styles.accuracyDeltaTextDown]}>
                  {hitRateDeltaView.label}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 스트릭 배지 (node 618:1739~1763) — StreakChallengeModal의 완료 배지와 동일한 모양
            (얼굴 아이콘 + "완료" 라벨, #8ECDFF/#058BFC)을 그대로 재사용한다. */}
        <View style={styles.accuracyStreakColumn}>
          <Text style={styles.accuracyStreakTitle}>{streakTitle}</Text>
          {summary.streakCount > 0 && (
            <View style={styles.accuracyStreakRow}>
              {Array.from({ length: totalBadges }).map((_, index) => (
                <View key={index} style={styles.accuracyStreakBadgeGroup}>
                  {/* 오늘(마지막) 배지 위 포인터 마커 (node 618:1763) — 자리는 항상 차지하고
                      today 배지에서만 채운다(다른 배지와 세로 위치가 어긋나지 않도록). */}
                  <View style={styles.accuracyStreakMarkerSlot}>
                    {todayInStreak && index === totalBadges - 1 && <View style={styles.accuracyStreakMarker} />}
                  </View>
                  <View style={styles.accuracyStreakBadgeCircle}>
                    <Image
                      source={require('@/assets/images/figma-icon-my-streak-face.png')}
                      style={styles.accuracyStreakFaceIcon}
                      contentFit="contain"
                    />
                  </View>
                  <Text style={styles.accuracyStreakBadgeLabel}>완료</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// "어제와 오늘 비교 데이터를 가시적으로 적어주기?" (node 246:569) 자리를 채우는 두 번째 줄.
// insightBody(위 data.model.message)는 "이번 검증 한 번"으로 무엇이 바뀌었는지만 말해줘서, 마이
// 탭 "내 모델"(my-model.tsx)에서 보여주는 "일반 대비 N.N배" · "누적 검증 N회"처럼 지금까지
// 쌓인 전체 진행 상황은 안 보였다 — 같은 화면(REP-12, GET /api/v1/skin/model)을 그대로 재사용해
// headline(가장 크게 벌어진 지표를 골라 서버가 만든 "일반 대비 배" 문장)과 verificationCount를
// 붙여서 보여준다. 검증 직후 이 화면에 오는 것이므로 방금 반영된 값까지 포함된 최신 상태다.
// 로딩/에러/미검증 상태는 이 줄이 부가 정보일 뿐이라 조용히 렌더링을 생략한다(에러 문구로
// 리포트 화면을 어수선하게 만들지 않는다) — AccuracyCard처럼 화면을 대체하지 않는다.
function ModelProgressLine() {
  const [model, setModel] = useState<SkinModelDetail | null>(null);

  useEffect(() => {
    getSkinModel(TEMP_USER_ID)
      .then(({ data }) => {
        if (data.status === 'AVAILABLE') setModel(data.model);
      })
      .catch((error) => {
        console.error('❌ 내 모델 진행 정보 조회 실패(인사이트 보조 문구):', error);
      });
  }, []);

  if (!model) return null;

  return (
    <Text style={styles.insightProgressLine}>
      누적 검증 {model.verificationCount}회 · {model.headline}
    </Text>
  );
}

// 지표 비교 행 (node 243:1691/1705/1719) — 게이지는 값 대신 행별 플랫 에셋을, 판정 아이콘은 서버가
// 내려준 verdict(HIT/CLOSE/UNDERESTIMATED/OVERESTIMATED)를 그대로 매핑해 선택한다.
function ComparisonRow({
  label,
  forecast,
  actual,
  verdict,
  gaugeSource,
}: {
  label: string;
  forecast: number;
  actual: number;
  verdict: VerificationVerdict;
  gaugeSource: number;
}) {
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>

      <View style={styles.comparisonMidGroup}>
        <Text style={styles.comparisonForecastValue}>{forecast}</Text>
        <Image source={gaugeSource} style={styles.comparisonGauge} contentFit="contain" />
        <Text style={styles.comparisonActualValue}>{actual}</Text>
      </View>

      <View style={styles.comparisonVerdictCell}>
        <Image
          source={VERDICT_ICON_SOURCES[verdict]}
          style={styles.comparisonVerdictIcon}
          contentFit="contain"
          accessibilityLabel={VERDICT_LABELS[verdict]}
        />
      </View>
    </View>
  );
}

// 그날 예보가 없어 대조하지 못한 지표(skipped) 행 — 판정 자체가 없으므로 예보/게이지/판정 아이콘
// 칸을 채우지 않고, 실측값과 스킵 사유만 같은 행 레이아웃 안에 얹는다(테이블 구조는 그대로 유지).
function SkippedComparisonRow({ label, actual, reason }: { label: string; actual: number; reason: string }) {
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>

      <View style={styles.comparisonMidGroup}>
        <Text style={styles.comparisonSkippedReason} numberOfLines={1}>
          {reason}
        </Text>
        <Text style={styles.comparisonActualValue}>{actual}</Text>
      </View>

      <View style={styles.comparisonVerdictCell}>
        <Text style={styles.comparisonSkippedDash}>–</Text>
      </View>
    </View>
  );
}

// 홈(index.tsx)/투두(todo.tsx) 화면이 속한 실제 메인 탭바(app-tabs.tsx의 NativeTabs, 웹의
// app-tabs.web.tsx)와 동일한 TAB_ITEMS·아이콘(SymbolView)·라벨(ThemedText)·레이아웃(tabBarStyles)을
// 그대로 재사용한다. NativeTabs는 라우터에 종속된 네이티브 탭바라 모달 안에서 그대로 마운트할 수
// 없어, 같은 소스에서 파생된 구성으로 정적으로 재현하고 탭을 누르면 모달을 닫은 뒤 해당 라우트로
// 실제 이동시킨다.
function ReportTabBar({ onNavigate }: { onNavigate: (item: TabItem) => void }) {
  return (
    <View style={tabBarStyles.bar}>
      {TAB_ITEMS.map((item) => {
        // 이 모달은 HOME에서만 열리므로 HOME이 실제 활성 탭이다.
        const active = item.name === 'index';
        const color = active ? NAV_BAR_ACTIVE_COLOR : NAV_BAR_INACTIVE_COLOR;
        const iconSource = NAV_BAR_ICON_SOURCES[item.name][active ? 'active' : 'inactive'];
        return (
          <Pressable key={item.name} onPress={() => onNavigate(item)} hitSlop={8} style={tabBarStyles.item}>
            <Image source={iconSource} style={styles.reportTabIcon} contentFit="contain" />
            <ThemedText type="small" style={[tabBarStyles.label, { color }]}>
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// node 618:1938("셀피 리포트 팝업" 리디자인, 위 STREAK_MODAL 상수 주석 참고) — 셀피 로딩
// 화면(AnalyzingStep)에서 검증 리포트(ReportStep)로 넘어가는 순간, 리포트 화면(적중률 링은 그대로
// 유지) 위에 겹쳐 뜨는 "5일 챌린지" 안내 모달. 좌표는 카드(332x346, radius 35.8) 원점 기준
// 상대값 — Figma가 배경에 blur(5.11px) 프로스티드 글라스 효과를 쓰지만 RN 기본만으로는 재현이
// 번거로워 불투명 흰 배경 + 그림자로 근사했다(예전 시안과 동일한 근사 방식).
// GET /api/v1/skin/verification/summary(streakCount)만으로 완전히 연동된다 — 검증 직후 이 모달을
// 매번 띄우고(리포트 화면의 AccuracyCard가 이미 보여주는 것과 같은 정보를 팝업으로 한 번 더
// 강조), 5일 단위로 순환하는 "사이클 내 며칠째"(dayInCycle)에 맞춰 타이틀 문구와 완료 배지
// 개수를 동적으로 그린다:
// - dayInCycle === 1: "다시 1일부터 도전해요!" (최초 시작과 스트릭이 끊긴 뒤 재시작을 서버가
//   구분해서 내려주지 않아 문구는 동일하게 취급한다)
// - dayInCycle 2~5: "{dayInCycle}일 연속 검증에 성공했어요!"
function StreakChallengeModal({ streakCount, onDismiss }: { streakCount: number; onDismiss: () => void }) {
  const [fontsLoaded] = useFonts(STREAK_MODAL_FONTS);

  // node 694:2080/2081("셀피 리포트 팝업", Figma 파일 9c7nKnuMLNcGYC33lmX8Im) — 이 팝업이 뜬 동안
  // 배경(리포트 화면)에 흰 wash(694:2080, opacity 0.4)와 카드 주변에 번지는 파란 글로우(694:2081,
  // Gaussian blur 50)를 겹쳐 "지금 이 팝업에 집중하라"는 느낌을 준다. 등장할 때만 살짝
  // 페이드인하고, 사라질 때는 별도 타이머 없이 팝업 자체(이 컴포넌트)가 언마운트되는 순간
  // 함께 사라진다 — "피부 예보 확인하기"를 눌러 onDismiss가 호출되면 showStreakModal이 false가
  // 되어 이 컴포넌트 전체(카드+wash+글로우)가 그대로 같이 사라지므로 별도 처리가 필요 없다.
  const [washAnim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(washAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [washAnim]);

  // 폰트 로드 전엔 아예 렌더하지 않는다 — 시스템 폰트로 잠깐 렌더돼 타이틀이 줄바꿈되는 걸 막는다.
  if (!fontsLoaded) return null;

  // 1~STREAK_CHALLENGE_GOAL_DAYS(5) 사이를 순환하는 "이번 사이클의 며칠째"로 환산한다
  // (streakCount=6이면 새 사이클의 1일차, 9면 4일차 — 5일마다 보너스를 받고 다시 도는 구조).
  const dayInCycle = ((Math.max(streakCount, 1) - 1) % STREAK_CHALLENGE_GOAL_DAYS) + 1;
  const pendingCount = STREAK_CHALLENGE_GOAL_DAYS - dayInCycle;
  const title = dayInCycle === 1 ? '다시 1일부터 도전해요!' : `${dayInCycle}일 연속 검증에 성공했어요!`;

  return (
    <Pressable style={styles.streakModalBackdrop} onPress={onDismiss}>
      {/* wash + 글로우는 카드보다 먼저 그려야 카드 뒤에서 번지는 것처럼 보인다. pointerEvents="none"
          이라 탭이 그대로 아래 backdrop Pressable로 전달돼 "바깥을 탭하면 닫힘" 동작을 안 막는다. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.streakModalWash, { opacity: Animated.multiply(washAnim, 0.4) }]}
      />
      <Animated.View pointerEvents="none" style={[styles.streakModalGlow, { opacity: washAnim }]}>
        <Image
          source={require('@/assets/images/figma-icon-streak-modal-glow.png')}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      </Animated.View>
      {/* 카드 자체는 탭해도 안 닫히도록 backdrop과 별개 Pressable로 감싼다(이벤트 버블 차단). */}
      <Pressable style={styles.streakModalCard} onPress={() => {}}>
        <Text style={styles.streakModalTitle}>{title}</Text>
        <Text style={styles.streakModalSubtitle}>
          {STREAK_CHALLENGE_GOAL_DAYS}일을 채우면 보너스 exp를 받아요
        </Text>

        <View style={styles.streakModalPanel} />

        {/* 완료 배지 dayInCycle개 + 목표 배지 pendingCount개 (node 618:1938 하위 GROUP 5개) —
            마지막 완료 배지 위에만 포인터 마커(node 618:1965)를 얹는다. */}
        <View style={styles.streakModalDayRow}>
          {Array.from({ length: dayInCycle }).map((_, index) => (
            <View key={`done-${index}`} style={styles.streakModalDayItem}>
              <View style={styles.streakModalMarkerSlot}>
                {index === dayInCycle - 1 && <View style={styles.streakModalMarker} />}
              </View>
              <View style={[styles.streakModalDayCircle, styles.streakModalDayCircleDone]}>
                <Image
                  source={require('@/assets/images/figma-icon-my-streak-face.png')}
                  style={styles.streakModalDayFaceDone}
                  contentFit="contain"
                />
              </View>
              <Text style={[styles.streakModalDayLabel, styles.streakModalDayLabelDone]}>완료</Text>
            </View>
          ))}
          {/* 목표 배지 라벨은 "몇 번째 날인지" 표시(node 694:2163/2164 참고, "4일"/"5일"처럼 칸마다
              다르다) — dayInCycle이 3이고 pendingCount가 2면 index 0→"4일", index 1→"5일"이 된다.
              STREAK_CHALLENGE_GOAL_DAYS를 그대로 찍으면 모든 칸이 "5일"로 똑같이 나오는 버그였다. */}
          {Array.from({ length: pendingCount }).map((_, index) => (
            <View key={`pending-${index}`} style={styles.streakModalDayItem}>
              <View style={styles.streakModalMarkerSlot} />
              <View style={[styles.streakModalDayCircle, styles.streakModalDayCirclePending]}>
                <Image
                  source={require('@/assets/images/figma-icon-my-streak-face-neutral.png')}
                  style={styles.streakModalDayFacePending}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.streakModalDayLabel}>{dayInCycle + index + 1}일</Text>
            </View>
          ))}
        </View>

        {/* CTA (node 618:1943/1944) */}
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.streakModalPrimaryButton, pressed && styles.pressed]}>
          <Text style={styles.streakModalPrimaryButtonText}>피부 예보 확인하기</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  );
}

// node 241:604 "iPhone 17 - 14 (검증 리포트)" — 부모 테마와 무관하게 항상 Figma 지정
// 연한 파란 배경(#DFEAFF)으로 렌더한다. data는 verifySelfie(POST /api/v1/skin/selfie) 성공 응답.
function ReportStep({
  data,
  onClose,
  onFinish,
}: {
  data: SelfieVerificationData;
  onClose: () => void;
  onFinish: () => void;
}) {
  const router = useRouter();

  // baseDate는 그 셀피가 대조한 예보의 날짜 — "어제/오늘"을 실제로 검증한 날짜 기준으로 표기한다
  // (검증 요청은 항상 오늘 날짜로 보내지만, 서버가 과거 baseDate도 허용하므로 하드코딩하지 않는다).
  const dayWord = useMemo(() => {
    const today = getTodayDateString();
    if (data.baseDate === today) return '오늘';
    const yesterday = new Date(`${today}T00:00:00+09:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayLabel = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    if (data.baseDate === yesterdayLabel) return '어제';
    const parsed = new Date(`${data.baseDate}T00:00:00+09:00`);
    return parsed.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  }, [data.baseDate]);

  const dateLabel = useMemo(() => {
    const parsed = new Date(`${data.baseDate}T00:00:00+09:00`);
    const formatted = parsed.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    return `${formatted} · 셀피 검증`;
  }, [data.baseDate]);

  const handleTabNavigate = (item: TabItem) => {
    onClose();
    if (item.name !== 'index') router.push(item.href as Href);
  };

  return (
    <View style={styles.reportContainer}>
      {/* 헤더 (node 243:1383/1385) */}
      <View style={styles.reportHeaderRow}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [styles.reportBackButton, pressed && styles.pressed]}>
          <Image
            source={require('@/assets/images/figma-icon-report-back.png')}
            style={styles.reportBackIcon}
            contentFit="contain"
          />
        </Pressable>
        <Text style={styles.reportHeaderTitle}>검증 리포트</Text>
      </View>

      <ScrollView
        style={styles.reportScroll}
        contentContainerStyle={styles.reportScrollContent}
        showsVerticalScrollIndicator={false}>
        {/* 날짜 (node 243:1388) */}
        <View style={styles.reportDateRow}>
          <Image
            source={require('@/assets/images/figma-icon-report-calendar.png')}
            style={styles.reportCalendarIcon}
            contentFit="contain"
          />
          <Text style={styles.reportDateLabel}>{dateLabel}</Text>
        </View>

        {/* "어제 예보, 이만큼 맞았어요!" (node 243:1393, "이만큼"만 블루) — 날짜 단어는 실제 검증한
            baseDate 기준(dayWord)으로, 항상 "어제"라고 못 박지 않는다. */}
        <Text style={styles.reportTitle}>
          {dayWord} 예보,{'\n'}
          <Text style={styles.reportTitleAccent}>이만큼</Text> 맞았어요!
        </Text>

        <AccuracyCard />

        {/* 비교 테이블 (node 243:1683, w:362, radius:16, border: Pale Sky 22%) — verifications는
            항상 1개 이상, skipped는 그날 예보가 없어 대조하지 못한 지표(있을 수도, 없을 수도). */}
        <View style={styles.comparisonSection}>
          <View style={styles.comparisonHeaderRow}>
            <Text style={[styles.comparisonHeaderLabel, styles.comparisonHeaderIndicatorCell]}>지표</Text>
            <View style={styles.comparisonHeaderMidGroup}>
              <Text style={styles.comparisonHeaderLabel}>예보</Text>
              <Text style={styles.comparisonHeaderLabel}>실측</Text>
            </View>
            <Text style={[styles.comparisonHeaderLabel, styles.comparisonHeaderVerdictCell]}>판정</Text>
          </View>

          {data.verifications.map((row, index) => {
            const isLast = index === data.verifications.length - 1 && data.skipped.length === 0;
            return (
              <View key={row.metric}>
                <ComparisonRow
                  label={metricLabel(row.metric)}
                  forecast={row.forecast.score}
                  actual={row.measured.score}
                  verdict={row.verdict}
                  gaugeSource={COMPARISON_GAUGE_ASSETS[index % COMPARISON_GAUGE_ASSETS.length]}
                />
                {!isLast && <View style={styles.comparisonRowDivider} />}
              </View>
            );
          })}
          {data.skipped.map((row, index) => {
            const isLast = index === data.skipped.length - 1;
            return (
              <View key={row.metric}>
                <SkippedComparisonRow label={metricLabel(row.metric)} actual={row.measured.score} reason={row.reason} />
                {!isLast && <View style={styles.comparisonRowDivider} />}
              </View>
            );
          })}
        </View>

        {/* 인사이트 (node 246:562/567/568) — 카드 배경 없이 페이지 위에 바로 배치.
            본문은 data.model.message(개인 가중치가 이번 검증으로 어떻게 보정됐는지 서버가 만든
            문장) — model.updated가 false여도 서버가 상황에 맞는 메시지를 내려주므로 그대로 쓴다. */}
        <View style={styles.insightSparklePill}>
          <Image
            source={require('@/assets/images/figma-icon-report-sparkle.png')}
            style={styles.insightSparkleIcon}
            contentFit="contain"
          />
        </View>
        <Text style={styles.insightTitle}>내 모델이 한 걸음 정밀해졌어요</Text>
        <Text style={styles.insightBody}>{data.model.message}</Text>
        <ModelProgressLine />
      </ScrollView>

      <View style={styles.reportFooter}>
        {/* CTA (node 246:594, w:345 h:52, radius:10) */}
        <Pressable
          onPress={onFinish}
          style={({ pressed }) => [styles.reportCtaButton, pressed && styles.pressed]}>
          <Text style={styles.reportCtaText}>오늘의 스킨케어 처방 보기</Text>
        </Pressable>

        {/* 홈/투두 화면과 동일한 하단 탭 내비게이션(app-tabs.tsx) 재현. */}
        <ReportTabBar onNavigate={handleTabNavigate} />
      </View>
    </View>
  );
}

type SelfieFlowStepsProps = {
  onClose: () => void;
  onFinish: () => void;
};

// Modal은 visible=false일 때 children을 언마운트한다(RN Modal 구현). 그 덕에 step 상태를
// 이 안쪽 컴포넌트에 두면 매번 새로 열릴 때마다 자연스럽게 1단계로 초기화되어,
// 별도의 "열릴 때 리셋" 이펙트가 필요 없다.
// HOME(index.tsx)·온보딩(onboarding-flow.tsx)과 동일하게 402x874 고정 캔버스로 감싼다.
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링). 이 래퍼가
// 없으면 넓은 뷰포트(데스크톱 웹 미리보기 등)에서 모든 요소가 실제 기기 대비 작게 렌더돼,
// 텍스트 등 개별 수치는 Figma와 정확히 일치해도 전체 비율이 달라 보인다.
type VerifyRequestState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; data: SelfieVerificationData };

function SelfieFlowSteps({ onClose, onFinish }: SelfieFlowStepsProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyRequestState>({ status: 'idle' });
  // 셀피 로딩 화면(AnalyzingStep)에서 리포트(ReportStep)로 넘어가는 순간 뜨는 "5일 챌린지"
  // 팝업(StreakChallengeModal, 위 STREAK_MODAL 상수 주석 참고) — 리포트 화면의 AccuracyCard가
  // 보여주는 것과 같은 streakCount를 팝업으로 한 번 더 강조해서 보여준다(적중률 링 등 나머지
  // 리포트 UI는 그대로 유지, 이 팝업만 겹쳐 뜬다). POST /skin/selfie(verifySelfie) 응답에 이미
  // streakCount가 실려 오므로(GET /skin/verification/summary와 같은 계산) 예전처럼 그 API를
  // 따로 또 호출하지 않는다 — 검증 성공 직후 verifyState.data.streakCount를 그대로 읽는다.
  const [streakModalDismissed, setStreakModalDismissed] = useState(false);
  // 연속 검증 보상(exp.reasons: VERIFICATION_STREAK) — 서버가 실제로 적립해주는데도 이 화면이
  // 지금까지 한 번도 보여준 적이 없었다(MY 탭에 들어가야 뒤늦게 레벨이 올라있는 걸 발견하는 식).
  // 다른 게이미케이션 API들과 같은 ExpGainPopup을 재사용해서, 5일 챌린지 팝업이 끝난 뒤(둘 다
  // 전체화면급 오버레이라 겹치면 한쪽이 가려짐) 이어서 보여준다.
  const [expPopupDismissed, setExpPopupDismissed] = useState(false);
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const canvasWrapperStyle = { width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale };
  const canvasScaleStyle = { transform: [{ scale }], transformOrigin: 'top left' as const };

  // 촬영을 다시 하도록 1단계로 되돌린다 — 400(SELFIE_IMAGE_INVALID/INVALID_INPUT)이나 502/504
  // 재시도까지 실패했을 때, 행이 생기지 않아 재시도가 안전하므로(같은 baseDate로 다시 보내도 됨)
  // 새로 촬영해서 다시 시도할 수 있게 한다.
  const rollbackToCapture = () => {
    setImageUri(null);
    setVerifyState({ status: 'idle' });
    setStep(1);
  };

  // POST /api/v1/skin/selfie(verifySelfie)는 2단계(AnalyzingStep) 진입과 동시에 SelfieFlowSteps가
  // 직접 보낸다 — AnalyzingStep은 순수 표시 전담, CaptureStep은 촬영/선택만 담당한다.
  // 단, 개발자 프리패스 더미 이미지는 실제 얼굴이 아니라 서버 분석이 항상 실패하므로, 이 경우엔
  // 실제 API를 호출하지 않고 더미 성공 응답으로 대신해 3단계(ReportStep) UI를 확인할 수 있게 한다.
  useEffect(() => {
    if (step !== 2 || !imageUri) return;
    let cancelled = false;
    setVerifyState({ status: 'pending' });

    if (imageUri === DEV_BYPASS_DUMMY_URI) {
      const timer = setTimeout(() => {
        if (cancelled) return;
        setVerifyState({ status: 'success', data: createDevBypassMockVerificationData() });
        setTimeout(() => {
          if (!cancelled) setStep(3);
        }, REPORT_TRANSITION_DELAY_MS);
      }, DEV_BYPASS_MOCK_DELAY_MS);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    verifySelfie(TEMP_USER_ID, getTodayDateString(), imageUri)
      .then(({ data }) => {
        if (cancelled) return;
        setVerifyState({ status: 'success', data });
        // 배지가 전부 "완료"로 바뀐 걸 잠깐 보여준 다음 리포트로 넘어간다.
        setTimeout(() => {
          if (!cancelled) setStep(3);
        }, REPORT_TRANSITION_DELAY_MS);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        handleVerifyError(error);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, imageUri]);

  // 예외 코드별 사용자 고지 + 후속 동작. 코드 문서는 SelfieVerificationErrorCode(api/skin.ts) 참고.
  const handleVerifyError = (error: unknown) => {
    if (error instanceof SelfieVerificationApiError) {
      switch (error.code) {
        case 'VERIFICATION_ALREADY_DONE':
          showAlert('오늘은 이미 검증을 완료했어요', '셀피 검증은 하루에 한 번만 할 수 있어요.', [
            { text: '확인', onPress: onClose },
          ]);
          return;
        case 'SKIN_FORECAST_NOT_FOUND':
          showAlert('수면 기록이 없어 예보와 대조할 수 없어요', '수면 데이터를 먼저 업로드해 주세요.', [
            { text: '확인', onPress: onClose },
          ]);
          return;
        case 'SELFIE_IMAGE_INVALID':
        case 'INVALID_INPUT':
          showAlert('사진을 다시 촬영해주세요', '얼굴이 잘 나오도록 다시 시도해 주세요.', [
            { text: '확인', onPress: rollbackToCapture },
          ]);
          return;
        case 'USER_NOT_FOUND':
        case 'USER_ID_HEADER_INVALID':
          showAlert('사용자 정보를 확인할 수 없어요', '앱을 다시 시작한 뒤 시도해 주세요.', [
            { text: '확인', onPress: onClose },
          ]);
          return;
        case 'SELFIE_ANALYSIS_FAILED':
        case 'SELFIE_ANALYSIS_TIMEOUT':
          showAlert('분석에 실패했어요', '다시 촬영해서 시도해 주세요.', [
            { text: '확인', onPress: rollbackToCapture },
          ]);
          return;
      }
    }
    showAlert('일시적인 오류가 발생했어요', '잠시 후 다시 시도해 주세요.', [
      { text: '확인', onPress: rollbackToCapture },
    ]);
  };

  if (step === 1) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: CAPTURE_BG_BOTTOM }]}>
        <View style={canvasWrapperStyle}>
          <LinearGradient colors={[CAPTURE_BG_TOP, CAPTURE_BG_BOTTOM]} style={[styles.canvas, canvasScaleStyle]}>
            <CaptureStep
              onClose={onClose}
              onCaptured={(uri) => {
                setImageUri(uri);
                setStep(2);
              }}
            />
          </LinearGradient>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 2) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: Colors.white }]}>
        <View style={canvasWrapperStyle}>
          <ThemedView style={[styles.canvas, canvasScaleStyle]}>
            <AnalyzingStep imageUri={imageUri} pending={verifyState.status !== 'success'} />
          </ThemedView>
        </View>
      </SafeAreaView>
    );
  }

  // step 3은 verifyState.status === 'success'일 때만 진입한다(위 useEffect가 성공 시에만 setStep(3)).
  if (verifyState.status !== 'success') return null;

  // 5일 챌린지 팝업이 끝난 뒤에만 exp 팝업을 띄운다 — 둘 다 전체화면급 오버레이라 동시에 겹치면
  // 한쪽이 가려진다. streakCount는 검증에 성공하면 항상 최소 1이므로(api/skin.ts의
  // SelfieVerificationData 문서 참고) showStreakModal은 사실상 매번 참이다.
  const showStreakModal = verifyState.data.streakCount > 0 && !streakModalDismissed;
  const showExpPopup = verifyState.data.exp.gained !== 0 && !showStreakModal && !expPopupDismissed;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: REPORT_BG }]}>
      <View style={canvasWrapperStyle}>
        <ThemedView style={[styles.canvas, canvasScaleStyle]}>
          <ReportStep data={verifyState.data} onClose={onClose} onFinish={onFinish} />
          {showStreakModal && (
            <StreakChallengeModal
              streakCount={verifyState.data.streakCount}
              onDismiss={() => setStreakModalDismissed(true)}
            />
          )}
          {showExpPopup && (
            <ExpGainPopup exp={verifyState.data.exp} onClose={() => setExpPopupDismissed(true)} />
          )}
        </ThemedView>
      </View>
    </SafeAreaView>
  );
}

export type SelfieVerificationFlowProps = {
  visible: boolean;
  onClose: () => void;
  onFinish: () => void;
};

export function SelfieVerificationFlow({ visible, onClose, onFinish }: SelfieVerificationFlowProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SelfieFlowSteps onClose={onClose} onFinish={onFinish} />
    </Modal>
  );
}

// node 176:849~852 — previewWrap(238x300) 기준 절대좌표. 바깥 모서리에만 radius:6.
const cornerPositionStyles = StyleSheet.create({
  topLeft: {
    left: -2,
    top: -2,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderTopLeftRadius: 6,
  },
  topRight: {
    left: OVAL_WIDTH - 22,
    top: -2,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderTopRightRadius: 6,
  },
  bottomLeft: {
    left: -2,
    top: OVAL_HEIGHT - 22,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 6,
  },
  bottomRight: {
    left: OVAL_WIDTH - 22,
    top: OVAL_HEIGHT - 22,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomRightRadius: 6,
  },
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  centerText: {
    textAlign: 'center',
  },
  reportTabIcon: {
    width: 22,
    height: 22,
  },

  // 공통 화면 셸
  // HOME(index.tsx)과 동일한 고정 프레임 규격 — 넓은 뷰포트에서도 실제 기기 비율을 유지한다.
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    overflow: 'hidden',
  },

  // 1단계: 촬영 — node 176:816 "셀피 화면"을 좌표 그대로 옮겼다.
  captureContainer: {
    flex: 1,
  },
  // "div"(node 176:817, padding: 68px 22px 0px, gap:7)
  captureHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 68,
    paddingHorizontal: 22,
  },
  captureCloseIcon: {
    width: 20,
    height: 20,
  },
  // "닫기" (node 176:822, Inter SemiBold 13px, White 75%)
  captureCloseText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  // "div"(node 176:828, padding: 0px 20px, gap:22) — 제목/프리뷰/상태 배지를 세로 중앙 정렬.
  captureBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingHorizontal: 20,
  },
  // "div"(node 176:829, gap:6)
  captureCopy: {
    alignItems: 'center',
    gap: 6,
  },
  // "밝은 곳에서 정면을 바라봐 주세요" (node 176:831, SF Pro Bold 22px, lineHeight:22px, White)
  captureTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  // "얼굴이 가이드에 맞춰지면 자동으로 촬영돼요" (node 176:833, Inter Regular 12px, White 50%)
  captureSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    textAlign: 'center',
  },
  // "div"(node 176:834, 238x300) — 오벌/링/브래킷/도트가 모두 이 박스 기준 절대좌표.
  previewWrap: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
  },
  // 바깥 점선 글로우 링 (node 176:848, x:-6 y:-6 w:250 h:312, stroke: Anakiwa 55%)
  previewOuterRing: {
    position: 'absolute',
    left: -6,
    top: -6,
    width: OVAL_WIDTH + 12,
    height: OVAL_HEIGHT + 12,
    borderTopLeftRadius: 140.5,
    borderTopRightRadius: 140.5,
    borderBottomLeftRadius: 129.26,
    borderBottomRightRadius: 129.26,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(158, 197, 255, 0.55)',
  },
  // 코너 브래킷 4개 (node 176:849~852, 24x24, White, radius:6 — 오벌 기준 -2px 오프셋)
  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFFFFF',
  },
  // 오벌 페이스 가이드 (node 176:835, fill: Mirage, radius: 134.5 134.5 123.74 123.74)
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    backgroundColor: '#1A1C2B',
    borderTopLeftRadius: 134.5,
    borderTopRightRadius: 134.5,
    borderBottomLeftRadius: 123.74,
    borderBottomRightRadius: 123.74,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // 실기기 카메라 프리뷰(CameraView) — 오벌(overflow:hidden) 안을 가득 채우는 기본 레이어.
  cameraFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // "div::part(frame).frame" (node 176:837, fill: Gray 8%)
  ovalGray8Overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(127, 127, 127, 0.08)',
  },
  // "div::part(ring).ring" (node 176:842, stroke: White, opacity:0.35, 오벌과 동일 radius)
  ovalDashedRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 134.5,
    borderTopRightRadius: 134.5,
    borderBottomLeftRadius: 123.74,
    borderBottomRightRadius: 123.74,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  // 트래킹 도트 3개 (node 176:853/855/857, 6x6, fill:#7EE6FF + 글로우) — previewWrap 기준 절대좌표.
  // 글로우는 Figma의 boxShadow(0px 0px 6px 1px rgba(126,230,255,1))를 그대로 옮긴 것 — spread(1px)까지
  // 정확히 재현하려면 spread 개념이 없는 구 shadow*/elevation 대신 RN의 CSS boxShadow 스타일을 쓴다.
  ovalGuideDotA: {
    position: 'absolute',
    left: 38,
    top: 120,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
    boxShadow: CAPTURE_DOT_GLOW,
  },
  ovalGuideDotB: {
    position: 'absolute',
    left: 198,
    top: 118,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
    boxShadow: CAPTURE_DOT_GLOW,
  },
  ovalGuideDotC: {
    position: 'absolute',
    left: 116,
    top: 238,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
    boxShadow: CAPTURE_DOT_GLOW,
  },
  // "div::part(empty).empty" (node 176:838, padding:12, gap:5)
  ovalPlaceholderContent: {
    alignItems: 'center',
    gap: 5,
  },
  // 갤러리 아이콘 (node 176:839, 28x28, opacity 0.45는 에셋에 이미 반영됨)
  ovalPlaceholderGlyph: {
    width: 28,
    height: 28,
  },
  // "카메라 미리보기 (사용자 얼굴)" (node 176:841, Inter Medium 13px, White, opacity:0.75)
  ovalPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    lineHeight: 16.9,
    letterSpacing: 0.13,
    maxWidth: 200,
    textAlign: 'center',
    fontWeight: '500',
  },
  scanBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanGlow: {
    position: 'absolute',
    width: '100%',
    height: 36,
    backgroundColor: 'rgba(126, 230, 255, 0.22)',
  },
  scanLine: {
    width: '100%',
    height: 2,
    backgroundColor: CAPTURE_CYAN,
    shadowColor: CAPTURE_CYAN,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  // 상태 배지 (node 176:864, padding: 7px 13px, gap:6, fill: rgba(255,255,255,0.14), radius:999)
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: CAPTURE_CYAN_BORDER,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
  },
  // "얼굴 위치를 프레임에 맞춥니다" (node 176:867, Inter Medium 14px, #7EE6FF)
  statusPillText: {
    color: CAPTURE_CYAN,
    fontSize: 14,
    fontWeight: '500',
  },
  captureFooter: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  // "5초 후 자동 촬영" (node 176:870, Inter Regular 12px, White 50%)
  autoCaptureText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
  },
  // 갤러리 버튼 + 셔터 버튼 + 대칭용 스페이서를 한 줄에 배치 — 셔터가 항상 중앙에 오도록 고정폭.
  captureControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 280,
  },
  // 갤러리(앨범) 백업 버튼 (44x44, White 14% 필)
  galleryButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  galleryButtonIcon: {
    width: 22,
    height: 22,
  },
  captureControlsSpacer: {
    width: 44,
    height: 44,
  },
  // 셔터 버튼 (node 176:873, 72x72)
  shutterButton: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 흰 원 (node 176:874, 58x58, radius:29, boxShadow: 0px 2px 10px rgba(0,0,0,0.4))
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  // 셔터 링 에셋 (node 176:875, 72x72, 흰 원 위에 절대 오버레이)
  shutterRing: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 72,
    height: 72,
  },
  // "촬영 원본은 저장되지 않습니다" (node 176:872, Inter Regular 10.5px, White 32%)
  captureDisclaimer: {
    color: 'rgba(255, 255, 255, 0.32)',
    fontSize: 10.5,
  },

  // 2단계: 분석 중 — node 176:961 "셀피 로딩 화면"을 좌표 그대로 옮겼다.
  analyzingContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // "div"(node 176:962, padding: 56px 24px 0px, gap:20)
  analyzingCenterGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 24,
  },
  // "div"(node 176:963, 132x132)
  selfieBadgeWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 아바타 원 (node 176:964, x:6 y:6 w:120 h:120, fill: Athens Gray, radius:60)
  selfieAvatarCircle: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: ANALYZING_AVATAR_BG,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "div::part(frame).frame" (node 176:966, fill: Gray 8%)
  selfieAvatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(127, 127, 127, 0.08)',
  },
  // "div::part(ring).ring" (node 176:971, stroke: Black, opacity:0.35)
  selfieAvatarDashedRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 60,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(0, 0, 0, 0.35)',
  },
  // "div::part(empty).empty" (node 176:967, padding:12, gap:5)
  selfieAvatarContent: {
    alignItems: 'center',
    gap: 5,
  },
  // 갤러리 아이콘 (node 176:968, 28x28, opacity 0.45는 에셋에 이미 반영됨)
  selfieAvatarGlyph: {
    width: 28,
    height: 28,
  },
  // 촬영/선택된 사진 — 아바타 원(radius:60) 안을 꽉 채우고, 원 밖으로 삐져나오지 않도록
  // 원과 동일한 radius를 한 번 더 적용한다(selfieAvatarCircle의 overflow:hidden과 이중 안전장치).
  selfieAvatarPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 60,
  },
  // "촬영된 셀피" (node 176:970, Inter Medium 13px, Black 75%)
  selfieAvatarText: {
    color: 'rgba(0, 0, 0, 0.75)',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 16.9,
    letterSpacing: 0.13,
    textAlign: 'center',
  },
  // 바깥 회전 링 에셋 (node 176:977, 132x132)
  selfieRotatingRingWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 132,
    height: 132,
  },
  selfieRotatingRing: {
    width: '100%',
    height: '100%',
  },
  // 트래킹 도트 흰 헤일로 (boxShadow: 0px 0px 0px 3px white → 13x13 흰 원으로 구현)
  selfieOrbitHalo: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // node 176:978 (center: 5.5, 41.5)
  selfieOrbitHaloA: {
    left: -1,
    top: 35,
  },
  // node 176:980 (center: 125.5, 40)
  selfieOrbitHaloB: {
    left: 119,
    top: 33.5,
  },
  // node 176:982 (center: 66, 130.5)
  selfieOrbitHaloC: {
    left: 59.5,
    top: 124,
  },
  selfieOrbitDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CAPTURE_CYAN,
  },
  // "div"(node 176:984, gap:5)
  analyzingTitleGroup: {
    alignItems: 'center',
    gap: 5,
  },
  // "피부 지표를 읽는 중" (node 176:986, Inter Bold 26px, Cod Gray)
  analyzingTitle: {
    color: ANALYZING_TEXT_DARK,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  // "약 N초 남았어요" (node 176:988, Inter Regular 16px, Tuna 61%)
  analyzingSubtitle: {
    color: ANALYZING_TEXT_MUTED,
    fontSize: 16,
    textAlign: 'center',
  },
  // 지표 카드 (node 176:989, w:334, padding: 5px 17px, fill: White, border: Pale Sky 22%, radius:16)
  metricList: {
    width: 334,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ANALYZING_CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 17,
    paddingVertical: 5,
  },
  // 행 (node 176:990 등, padding: 12px 0px 13px)
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 13,
  },
  // 마지막 항목(어제 예보와 대조) 제외 하단 구분선 (stroke: Pale Sky 8%)
  metricRowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ANALYZING_ROW_DIVIDER,
  },
  // 완료/대기 행 라벨 (node 176:992 등, Inter SemiBold 15px, Cod Gray)
  metricLabel: {
    color: ANALYZING_TEXT_DARK,
    fontSize: 15,
    fontWeight: '600',
  },
  // 대기 행 라벨 (node 176:1015, Inter SemiBold 13px, Tuna 28%)
  metricLabelPending: {
    color: ANALYZING_TEXT_MUTED_28,
    fontSize: 13,
    fontWeight: '600',
  },
  metricStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // "진행 중" 행만 gap:6 (node 176:1009)
  metricStatusRowActive: {
    gap: 6,
  },
  // 완료 아이콘 (node 176:995, 16x16)
  metricDoneIcon: {
    width: 16,
    height: 16,
  },
  // "완료" (node 176:997, Inter SemiBold 12px, Malachite)
  metricDoneLabel: {
    color: ANALYZING_DONE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  // "진행 중" (node 176:1012, Inter SemiBold 12px, Dodger Blue)
  metricActiveLabel: {
    color: ANALYZING_ACTIVE_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  // 대기 아이콘 (node 176:1018, 14x14)
  metricPendingIcon: {
    width: 14,
    height: 14,
  },
  // "대기" (node 176:1020, Inter SemiBold 12px, Tuna 28%)
  metricPendingLabel: {
    color: ANALYZING_TEXT_MUTED_28,
    fontSize: 12,
    fontWeight: '600',
  },
  // "div"(node 176:1021, padding: 0px 28px 40px, gap:2)
  analyzingFooter: {
    gap: 2,
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  // "분석이 끝나는 즉시 원본 사진은 폐기됩니다." (node 176:1023, Noto Sans KR 17px, lineHeight:1.55em, Tuna 28%)
  analyzingFooterTextPrimary: {
    color: ANALYZING_TEXT_MUTED_28,
    fontSize: 17,
    lineHeight: 17 * 1.55,
    textAlign: 'center',
  },
  // "서버에는 숫자 지표만 남습니다." (node 176:1025, Noto Sans KR 15px, lineHeight:1.55em, Tuna 28%)
  analyzingFooterTextSecondary: {
    color: ANALYZING_TEXT_MUTED_28,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    textAlign: 'center',
  },

  // "셀피 리포트 팝업" > 모달(node 487:273/543) — 리포트 화면(캔버스 402x874) 전체를 덮는 반투명
  // 백드롭 + 그 위에 뜨는 카드. ReportStep과 같은 캔버스 좌표계 위에 절대 배치된다.
  streakModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: STREAK_MODAL_BACKDROP,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // 흰 wash(node 694:2080, x:-18 y:-102 w:431 h:1016, fill:#FFFFFF opacity:0.4) — 캔버스(402x874)
  // 경계를 살짝 넘어서까지 덮는다. backdrop(Pressable) 기준 절대 좌표.
  streakModalWash: {
    position: 'absolute',
    left: -18,
    top: -102,
    width: 431,
    height: 1016,
    backgroundColor: '#FFFFFF',
  },
  // 파란 글로우(node 694:2081, 레이아웃 박스 x:23 y:162 w:349 h:456 radius:35 + Gaussian blur 50,
  // 카드(top:204 h:346, 중심 y=377) 주변에 번지도록 배치) — Figma가 내보낸 PNG는 blur 여백(각 변
  // 100px)까지 포함해 549x656이라, 레이아웃 박스와 같은 중심점을 갖도록 좌표를 역산했다.
  streakModalGlow: {
    position: 'absolute',
    left: -76.5,
    top: 62,
    width: 549,
    height: 656,
  },
  // 카드(node 618:1938/1939, w:332 h:346, radius:35.8) — Figma는 배경에 blur(5.11px) 프로스티드
  // 글라스 효과를 쓰지만 RN 기본만으로는 재현이 번거로워 불투명 흰 배경 + 그림자로 근사했다
  // (예전 시안(487:543)과 동일한 근사 방식). 가로는 (402-332)/2=35로 가운데 정렬, 세로는 예전
  // 시안과 같은 top:204를 유지했다(이 새 카드는 느슨한 캔버스 그룹이라 절대 좌표가 없음).
  streakModalCard: {
    position: 'absolute',
    left: 35,
    top: 204,
    width: 332,
    height: 346,
    backgroundColor: Colors.white,
    borderRadius: 35.8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  // "다시 1일부터 도전해요!" (node 618:1940, 카드 원점 기준 x:29 y:45 w:279 h:25)
  streakModalTitle: {
    position: 'absolute',
    left: 29,
    top: 45,
    width: 279,
    fontSize: 20,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: STREAK_MODAL_TITLE,
  },
  // "5일을 채우면 보너스 exp를 받아요" (node 618:1941, x:28.5 y:79 w:246 h:19)
  streakModalSubtitle: {
    position: 'absolute',
    left: 28.5,
    top: 79,
    width: 246,
    fontSize: 15,
    fontFamily: PRETENDARD_REGULAR,
    color: STREAK_MODAL_SUBTITLE,
  },
  // 연한 블루 배경 패널 (node 618:1942, x:8.5 y:107 w:317 h:139, radius:9) — 배지 행의 배경
  streakModalPanel: {
    position: 'absolute',
    left: 8.5,
    top: 107,
    width: 317,
    height: 139,
    backgroundColor: STREAK_MODAL_PANEL_BG,
    borderRadius: 9,
  },
  // 배지 행 (node 618:1938 하위 GROUP 5개, x:15.84 y:133.58 w:301) — 5개 항목 균등 배치.
  // 완료 칸 수가 동적이라(streakCount에 따라 마지막 완료 배지 위치가 바뀜) 마커(618:1965)를 행
  // 전체 기준 절대좌표 하나로 고정하지 않고, 각 항목 위에 마커 자리(streakModalMarkerSlot)를
  // 두어 "마지막 완료 배지" 항목에서만 채운다 — 그만큼 원래 marker top(113)보다 위로 올려
  // 자리를 확보한다.
  streakModalDayRow: {
    position: 'absolute',
    left: 15.84,
    top: 120,
    width: 301,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakModalDayItem: {
    width: 53.87,
    alignItems: 'center',
    gap: 6,
  },
  // 마커 자리(node 618:1965 위치 근사) — 항상 높이를 차지해 모든 배지의 원이 같은 y에 온다.
  streakModalMarkerSlot: {
    height: 13.58,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // 마지막 완료 배지 위 포인터 마커 (node 618:1965, 14x14 다이아몬드) — CSS 삼각형 트릭으로
  // 아래쪽을 가리키는 작은 마커를 그린다(별도 SVG 에셋 없이 border만으로 구현).
  streakModalMarker: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: STREAK_MODAL_MARKER,
  },
  // 배지 원(53.87x53.87) — 상태별 배경/테두리는 인라인 스타일로 덧붙인다
  streakModalDayCircle: {
    width: 53.87,
    height: 53.87,
    borderRadius: 26.94,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  streakModalDayCircleDone: {
    backgroundColor: STREAK_MODAL_DAY_DONE_BG,
    borderWidth: 1.5,
    borderColor: STREAK_MODAL_DAY_DONE_BORDER,
  },
  streakModalDayCirclePending: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: STREAK_MODAL_DAY_PENDING_BORDER,
  },
  // "실패" 상태(node 694:2150/2151) — 아직 렌더링에 쓰이진 않지만(위 STREAK_MODAL_DAY_FAILED_BORDER
  // 주석 참고) 데이터가 생기면 바로 붙일 수 있게 준비해둔다.
  streakModalDayCircleFailed: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: STREAK_MODAL_DAY_FAILED_BORDER,
  },
  // 완료 배지 아이콘(node 618:1959, 39.6x33.66)이 목표 배지 아이콘(node 618:1947, 34.85x28.53)보다
  // 살짝 크다 — Figma 원본 그대로 두 크기를 구분한다.
  streakModalDayFaceDone: {
    width: 40,
    height: 34,
  },
  streakModalDayFacePending: {
    width: 35,
    height: 28.5,
  },
  // 실패 배지 아이콘(node 694:2152, 38.73x31.98)
  streakModalDayFaceFailed: {
    width: 39,
    height: 32,
  },
  streakModalDayLabel: {
    fontSize: 13,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: STREAK_MODAL_DAY_PENDING_BORDER,
  },
  streakModalDayLabelDone: {
    color: STREAK_MODAL_DAY_DONE_BORDER,
  },
  streakModalDayLabelFailed: {
    color: STREAK_MODAL_DAY_FAILED_BORDER,
  },
  // "피부 예보 확인하기" 버튼 (node 618:1943/1944, x:21 y:261 w:283 h:55, radius:26)
  streakModalPrimaryButton: {
    position: 'absolute',
    left: 21,
    top: 261,
    width: 283,
    height: 55,
    borderRadius: 26,
    backgroundColor: STREAK_MODAL_PRIMARY_BTN_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakModalPrimaryButtonText: {
    fontSize: 16,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: Colors.white,
  },

  // 3단계: 검증 리포트 — node 241:604 "iPhone 17 - 14 (검증 리포트)"를 좌표 그대로 옮겼다.
  reportContainer: {
    flex: 1,
    backgroundColor: REPORT_BG,
  },
  // "div"(node 243:1383, x:13 y:63 32x32) + "div"(node 243:1385, x:118 y:63) — 뒤로가기 + 타이틀.
  // 뒤로가기는 32x32 정사각형이라 행 높이(32)에 영향을 주지 않도록 절대 배치하고, 타이틀은 버튼
  // 유무와 무관하게 캔버스 폭 전체 기준으로 중앙 정렬한다(Figma 타이틀 박스 중심이 버튼을 제외한
  // 나머지 영역의 중앙이 아니라 캔버스 중앙에 훨씬 가깝다).
  reportHeaderRow: {
    marginTop: 63,
    height: 32,
    justifyContent: 'center',
  },
  reportBackButton: {
    position: 'absolute',
    left: 13,
    top: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBackIcon: {
    width: 11,
    height: 18,
  },
  // "검증 리포트" (node 243:1386, Inter Bold 17px, Cod Gray)
  reportHeaderTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: REPORT_TEXT_DARK,
  },
  reportScroll: {
    flex: 1,
  },
  // "div"(node 243:1387, padding: 16px 20px 0px) — 헤더 바로 아래 첫 콘텐츠(날짜/타이틀)의 상단
  // 여백. 이후 섹션 간 간격은 Figma 절대좌표 델타값 그대로 각 요소의 marginTop으로 준다(균일
  // gap이 아니라 9~18px로 제각각이라 ScrollView의 단일 gap으로는 표현할 수 없다).
  reportScrollContent: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Spacing.four,
  },
  // "div"(node 243:1388, gap:6)
  reportDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reportCalendarIcon: {
    width: 14,
    height: 14,
  },
  // "8월 4일 화요일 · 셀피 검증" (node 243:1391, Inter Medium 16px, Manatee)
  reportDateLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: REPORT_TEXT_MUTED,
  },
  // "어제 예보, 이만큼 맞았어요!" (node 243:1393, Inter ExtraBold 25px, lineHeight:30.36px)
  // 날짜 행과의 간격(node 243:1387의 gap:9.18px).
  reportTitle: {
    marginTop: 9,
    fontSize: 25,
    lineHeight: 30.36,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: REPORT_TEXT_DARK,
  },
  reportTitleAccent: {
    color: REPORT_BLUE,
  },
  // 적중률 카드 (node 618:1727, w:364.08 h:152, radius:13.86, fill:#FFFFFF, stroke:#058BFC 0.6px)
  // — 예전엔 단색 배경(#F4F0FD)이었는데 흰 배경 + 얇은 파란 테두리로 바뀌었다.
  // 타이틀과의 간격(y:221 - 타이틀 블록 하단 ≈15px).
  accuracyCard: {
    marginTop: 15,
    borderRadius: 14,
    borderWidth: 0.6,
    borderColor: STREAK_MODAL_DAY_DONE_BORDER,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: Colors.white,
  },
  // 로딩/에러/빈 상태(NO_VERIFICATION) 공용 — 링/스트릭 레이아웃 대신 가운데 정렬된 짧은 문구만 보여준다.
  accuracyCardCentered: {
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  accuracyEmptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: REPORT_NAVY,
    textAlign: 'center',
  },
  accuracyEmptyText: {
    fontSize: 12,
    fontWeight: '500',
    color: REPORT_DOLPHIN,
    textAlign: 'center',
  },
  // "div"(node 243:1508, gap:18)
  accuracyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  // 원형 링 (node 618:1728/1729, 112.67x112.67 — 예전 118x118에서 살짝 축소)
  accuracyRingWrap: {
    width: 113,
    height: 113,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accuracyRingImage: {
    position: 'absolute',
    width: 113,
    height: 113,
  },
  accuracyRingContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accuracyRateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  // "84" (node 618:1732, Inter Bold 24.06px, letterSpacing:-0.0198em, #3366FF)
  accuracyRateText: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: REPORT_BLUE,
  },
  // "%" (node 618:1733, Inter Bold 15.28px, letterSpacing:-0.0313em, #3366FF)
  accuracyRatePercent: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: REPORT_BLUE,
    marginBottom: 2,
  },
  // "예보 적중률" (node 618:1735, Inter SemiBold 10.5px, Dolphin)
  accuracyRateLabel: {
    marginTop: 2,
    fontSize: 10.5,
    fontWeight: '600',
    color: REPORT_DOLPHIN,
  },
  // "+6%p" 필 (node 618:1737, padding: ~3px 7px, fill: Tara, radius:7.6)
  accuracyDeltaPill: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: REPORT_TARA_BG,
  },
  // 델타가 음수(최근 검증이 누적 평균보다 낮음)일 때 — Figma엔 상승 케이스만 있어 위 REPORT_TARA_BG
  // 톤을 참고해 만든 빨강 버전.
  accuracyDeltaPillDown: {
    backgroundColor: REPORT_DELTA_DOWN_BG,
  },
  // "+6%p" 텍스트 (node 618:1738, Inter Bold 10.5px, Mountain Meadow)
  accuracyDeltaText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: REPORT_MEADOW,
  },
  accuracyDeltaTextDown: {
    color: REPORT_DELTA_DOWN_TEXT,
  },
  // "div"(node 618:1520류, gap:10)
  accuracyStreakColumn: {
    flex: 1,
    gap: 10,
  },
  // "5일 연속 검증 완료!" (node 618:1739, Inter/Pretendard Bold 16.84px, #031949)
  accuracyStreakTitle: {
    fontSize: 16.8,
    fontWeight: '700',
    color: REPORT_NAVY,
  },
  // "div"(node 618:1740, gap≈6)
  accuracyStreakRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  accuracyStreakBadgeGroup: {
    alignItems: 'center',
    gap: 5,
  },
  // 완료(오늘 포함) 배지 위 포인터 마커 자리 — 항상 높이를 차지해 모든 배지의 원이 같은 y에 온다.
  accuracyStreakMarkerSlot: {
    height: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // 마커(node 618:1763, 13.77x13.77 다이아몬드) — CSS 삼각형 트릭으로 근사(StreakChallengeModal의
  // streakModalMarker와 동일 패턴).
  accuracyStreakMarker: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: STREAK_MODAL_MARKER,
  },
  // 배지 원 (node 618:1741 등, ~39x39, radius:~19.5, fill:#8ECDFF, stroke:#058BFC — StreakChallengeModal의
  // "완료" 배지와 동일한 스타일). 예전엔 26x26 옅은 파랑(#C9DAFF) 배경에 체크 아이콘이었다.
  accuracyStreakBadgeCircle: {
    width: 39,
    height: 39,
    borderRadius: 19.5,
    borderWidth: 1.1,
    borderColor: STREAK_MODAL_DAY_DONE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: STREAK_MODAL_DAY_DONE_BG,
    overflow: 'hidden',
  },
  // 배지 안 얼굴 아이콘(node 618:1743 등, ~28x24) — StreakChallengeModal과 같은
  // figma-icon-my-streak-face.png를 재사용한다(예전의 체크/별 아이콘 대신).
  accuracyStreakFaceIcon: {
    width: 28,
    height: 24,
  },
  // "완료" (node 618:1744 등, Pretendard SemiBold 9.66px, #058BFC) — 이제 모든 배지가 동일하게
  // "완료"만 표시한다(예전엔 "오늘" 배지만 별도 라벨/굵기였다).
  accuracyStreakBadgeLabel: {
    fontSize: 9.7,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: STREAK_MODAL_DAY_DONE_BORDER,
  },
  // 비교 테이블 (node 243:1683, w:362, padding: 7px 17px 5px, border: Pale Sky 22%, radius:16)
  // 적중률 카드와의 간격(y:385 - 카드 하단 ≈6px, 카드 바로 아래 붙는 좁은 간격).
  comparisonSection: {
    marginTop: 6,
    backgroundColor: REPORT_BG,
    borderWidth: 1,
    borderColor: REPORT_TABLE_BORDER,
    borderRadius: 16,
    paddingHorizontal: 17,
    paddingTop: 7,
    paddingBottom: 5,
  },
  // 헤더 행 (node 243:1684, padding: 11px 0px 12px, 하단 stroke: Pale Sky 8%)
  comparisonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 11,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: REPORT_TABLE_DIVIDER,
  },
  // "지표"/"예보"/"실측"/"판정" 공통 (Inter Bold 11px, Tuna 28%)
  comparisonHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: REPORT_HEADER_LABEL,
  },
  comparisonHeaderIndicatorCell: {
    flex: 1.2,
  },
  comparisonHeaderMidGroup: {
    flex: 1.4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  comparisonHeaderVerdictCell: {
    flex: 1,
    textAlign: 'right',
  },
  // 데이터 행 (node 243:1691 등, padding: 12px 0px 13px, 그리드 1.2fr/1.4fr/1fr)
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 13,
  },
  comparisonRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: REPORT_TABLE_DIVIDER,
  },
  // "혈색"/"장벽"/"다크서클 회복" (Inter Bold 16px, Cod Gray (105:423) = #171717)
  comparisonLabel: {
    flex: 1.2,
    fontSize: 16,
    fontWeight: '700',
    color: REPORT_TEXT_DARKEST,
  },
  comparisonMidGroup: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 예보 값 (Inter Bold 15px, Tuna 61% — 실측보다 옅은 톤)
  comparisonForecastValue: {
    fontSize: 15,
    fontWeight: '700',
    color: REPORT_VALUE_MUTED,
  },
  // 실측 값 (Inter Bold 15px, Cod Gray (105:423) = #171717)
  comparisonActualValue: {
    fontSize: 15,
    fontWeight: '700',
    color: REPORT_TEXT_DARKEST,
  },
  // 게이지 바 (node 243:1697 등) — 트랙/진행색/마커가 한 장으로 플랫하게 그려진 행별 에셋.
  comparisonGauge: {
    flex: 1,
    height: 15,
  },
  comparisonVerdictCell: {
    flex: 1,
    alignItems: 'flex-end',
  },
  comparisonVerdictIcon: {
    width: 15,
    height: 15,
  },
  // skipped 행 전용 — 예보/게이지 대신 스킵 사유를 같은 자리(comparisonMidGroup)에 얹는다.
  comparisonSkippedReason: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: REPORT_VALUE_MUTED,
  },
  comparisonSkippedDash: {
    fontSize: 15,
    fontWeight: '700',
    color: REPORT_VALUE_MUTED,
  },
  // 인사이트 스파클 필 (node 246:562, padding: 3px 9px, fill: Blue Ribbon 10%, radius: pill)
  // 비교 테이블과의 간격(y:588 - 테이블 하단 ≈9px).
  insightSparklePill: {
    marginTop: 9,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: REPORT_SPARKLE_BG,
  },
  insightSparkleIcon: {
    width: 11,
    height: 11,
  },
  // "내 모델이 한 걸음 정밀해졌어요" (node 246:567, Inter Bold 13.56px, Cod Gray (105:423) = #171717)
  // 스파클 필과의 간격(y:618 - 필 하단 ≈13px).
  insightTitle: {
    marginTop: 13,
    fontSize: 13.5,
    fontWeight: '700',
    color: REPORT_TEXT_DARKEST,
  },
  // "어제와 오늘 비교 데이터를..." (node 246:569, Inter Regular 12.55px, lineHeight:20.08px, Tuna 61%)
  // 타이틀과의 간격(y:651 - 타이틀 하단 ≈7px).
  insightBody: {
    marginTop: 7,
    fontSize: 12.5,
    lineHeight: 20,
    color: REPORT_VALUE_MUTED,
  },
  // "누적 검증 N회 · {headline}" (ModelProgressLine) — Figma엔 없는 보조 줄이라 insightBody 바로
  // 아래 여백만 조금 주고 같은 톤으로 맞췄다.
  insightProgressLine: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 20,
    fontWeight: '600',
    color: REPORT_BLUE,
  },
  reportFooter: {
    paddingTop: Spacing.two,
  },
  // CTA (node 246:594, x:29 w:345 h:52, fill: #031949, radius:10)
  reportCtaButton: {
    marginHorizontal: 29,
    marginBottom: Spacing.three,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: REPORT_NAVY,
  },
  reportCtaText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
