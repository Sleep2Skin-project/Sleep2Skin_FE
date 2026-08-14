import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
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
  getVerificationSummary,
  SelfieVerificationApiError,
  SkinModelUserNotFoundError,
  verifySelfie,
  type SelfieVerificationData,
  type VerificationSummary,
  type VerificationVerdict,
} from '@/api/skin';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TabSymbol } from '@/components/ui/tab-symbol';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { TAB_ITEMS, tabBarStyles, type TabItem } from '@/constants/tabs';
import { Spacing } from '@/constants/theme';
import { useDesignScale } from '@/hooks/use-design-scale';
import { useTheme } from '@/hooks/use-theme';
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
// index.tsx(FORECAST_METRIC_LABELS)와 동일한 한글 라벨을 써서 앱 전체 표기를 통일한다.
const VERIFICATION_METRIC_LABELS: Record<string, string> = {
  DARK_CIRCLE: '다크서클',
  BARRIER: '장벽',
  COMPLEXION: '안색',
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
const REPORT_ACCURACY_CARD_BG = '#F4F0FD';
const REPORT_DOLPHIN = '#6B6478';
const REPORT_TARA_BG = '#E1F6EB';
const REPORT_MEADOW = '#1FAA6A';
const REPORT_STREAK_BADGE_BG = '#C9DAFF';
const REPORT_TABLE_BORDER = 'rgba(112, 115, 124, 0.22)'; // Pale Sky 22%
const REPORT_TABLE_DIVIDER = 'rgba(112, 115, 124, 0.08)'; // Pale Sky 8%
const REPORT_HEADER_LABEL = 'rgba(55, 56, 60, 0.28)'; // Tuna 28%
const REPORT_VALUE_MUTED = 'rgba(55, 56, 60, 0.61)'; // Tuna 61%
const REPORT_SPARKLE_BG = 'rgba(0, 102, 255, 0.1)'; // Blue Ribbon 10%

// node 487:273 "셀피 리포트 팝업" > 모달 카드(node 487:543, "연속 출석에 실패했어요") 전용 색상.
// 연속 검증(스트릭)을 "일자별 완료/실패/예정" 배열로 조회하는 API는 없다(GET
// /api/v1/skin/verification/summary는 streakCount 정수 하나와 최근 1건만 내려줄 뿐, 과거
// 스트릭을 "이어서 재개"할 수 있는 개념 자체가 백엔드에 없다) — 그래서 요일별 배지 상태는
// Figma 시안 값을 그대로 옮긴 정적 목업이고, 두 CTA 버튼은 실제 재개/재시작 로직 없이 모달을
// 닫기만 한다. 실제 로직이 필요해지면 백엔드에 전용 API가 먼저 있어야 한다.
const STREAK_MODAL_BACKDROP = 'rgba(255, 255, 255, 0.4)';
const STREAK_MODAL_TITLE = '#000000';
const STREAK_MODAL_SUBTITLE = '#525252';
const STREAK_MODAL_PANEL_BG = 'rgba(209, 234, 255, 0.6)';
const STREAK_MODAL_DAY_DONE_BG = '#8ECDFF';
const STREAK_MODAL_DAY_DONE_BORDER = '#058BFC';
const STREAK_MODAL_DAY_MISSED_BORDER = '#F91D33';
const STREAK_MODAL_DAY_PENDING_BORDER = '#949597';
const STREAK_MODAL_LABEL_MUTED = '#8B8B93';
const STREAK_MODAL_PRIMARY_BTN_BG = '#008DFF';
const STREAK_MODAL_SECONDARY_BTN_BG = '#E3E3E3';

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

type StreakDayState = 'done' | 'missed' | 'pending';

// 요일 배지 5개(node 487:246/247/252/269/271) — 위 주석대로 실제 스트릭 데이터가 아니라
// Figma 시안이 보여주는 정적 예시(3일 완료 → 4일째 실패 → 5일째는 아직 오지 않음) 그대로다.
const STREAK_MODAL_DAYS: { state: StreakDayState; label: string }[] = [
  { state: 'done', label: '완료' },
  { state: 'done', label: '완료' },
  { state: 'done', label: '완료' },
  { state: 'missed', label: '4일' },
  { state: 'pending', label: '5일' },
];

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
    if (isWeb || !cameraReady) {
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

type AccuracyBannerState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no_verification'; message: string | null }
  | { kind: 'available'; baseDate: string; summary: VerificationSummary };

// "84% 예보 적중률" 링 + "N일 연속 검증 완료!" 스트릭 배지 (node 243:1507).
// GET /api/v1/skin/verification/summary(HOME-09)를 직접 호출해 채운다.
// - 링 중앙 수치는 summary.hitRate(누적 적중률). summary.latest.hitRate(그날치)와는 다른 숫자라
//   섞어 쓰지 않고 "최근 검증 N%" 배지로 따로 보여준다.
// - 스트릭 배지 개수는 summary.streakCount를 그대로 쓰되, "오늘"은 응답의 baseDate(요청한
//   오늘 날짜)와 summary.latest.baseDate가 같을 때만 별 배지로 표시한다 — 오늘 아직 검증하지
//   않았는데도 별을 붙이면 하지 않은 일을 한 것처럼 보이게 된다("오늘 미검증이 연속을 끊지
//   않는다"는 규칙과, 하지 않은 일로 보여선 안 된다는 규칙은 서로 다른 요구라 둘 다 지켜야 한다).
function AccuracyCard() {
  const [state, setState] = useState<AccuracyBannerState>({ kind: 'loading' });

  useEffect(() => {
    const baseDate = getTodayDateString();

    getVerificationSummary(TEMP_USER_ID, baseDate)
      .then(({ data }) => {
        setState(
          data.status === 'AVAILABLE'
            ? { kind: 'available', baseDate: data.baseDate, summary: data.summary }
            : { kind: 'no_verification', message: data.message }
        );
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

  const { summary, baseDate } = state;
  const todayInStreak = summary.streakCount > 0 && summary.latest.baseDate === baseDate;
  const totalBadges = Math.min(summary.streakCount, STREAK_BADGE_MAX);
  const checkBadgeCount = todayInStreak ? Math.max(totalBadges - 1, 0) : totalBadges;
  const streakTitle =
    summary.streakCount === 0
      ? '오늘부터 연속 검증을 시작해보세요'
      : todayInStreak
        ? `${summary.streakCount}일 연속 검증 완료!`
        : `${summary.streakCount}일 연속 검증 중 · 오늘도 이어가 볼까요?`;

  return (
    <View style={styles.accuracyCard}>
      <View style={styles.accuracyTopRow}>
        {/* 원형 링 + 중앙 수치 (node 243:1509, 118x118) */}
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
            <Text style={styles.accuracyRateLabel}>누적 예보 적중률</Text>
            <View style={styles.accuracyDeltaPill}>
              <Text style={styles.accuracyDeltaText}>최근 검증 {summary.latest.hitRate}%</Text>
            </View>
          </View>
        </View>

        {/* 스트릭 배지 (node 243:1520) */}
        <View style={styles.accuracyStreakColumn}>
          <Text style={styles.accuracyStreakTitle}>{streakTitle}</Text>
          {summary.streakCount > 0 && (
            <View style={styles.accuracyStreakRow}>
              {Array.from({ length: checkBadgeCount }).map((_, index) => (
                <View key={index} style={styles.accuracyStreakBadgeGroup}>
                  <View style={styles.accuracyStreakBadgeCircle}>
                    <Image
                      source={require('@/assets/images/figma-icon-report-streak-check.png')}
                      style={styles.accuracyStreakCheckIcon}
                      contentFit="contain"
                    />
                  </View>
                </View>
              ))}
              {todayInStreak && (
                <View style={styles.accuracyStreakBadgeGroup}>
                  <View style={[styles.accuracyStreakBadgeCircle, styles.accuracyStreakBadgeCircleToday]}>
                    <Image
                      source={require('@/assets/images/figma-icon-report-streak-star.png')}
                      style={styles.accuracyStreakStarIcon}
                      contentFit="contain"
                    />
                  </View>
                  <Text style={[styles.accuracyStreakBadgeLabel, styles.accuracyStreakBadgeLabelToday]}>오늘</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
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
  const theme = useTheme();

  return (
    <View style={[tabBarStyles.bar, { backgroundColor: theme.background, borderTopColor: theme.backgroundElement }]}>
      {TAB_ITEMS.map((item) => {
        // 이 모달은 HOME에서만 열리므로 HOME이 실제 활성 탭이다.
        const active = item.name === 'index';
        const themeColor = active ? 'text' : 'textSecondary';
        return (
          <Pressable key={item.name} onPress={() => onNavigate(item)} hitSlop={8} style={tabBarStyles.item}>
            <TabSymbol sf={item.sf} android={item.android} tintColor={theme[themeColor]} size={22} />
            <ThemedText type="small" themeColor={themeColor} style={tabBarStyles.label}>
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// node 487:273 "셀피 리포트 팝업" > 모달 카드(node 487:543) — 셀피 로딩 화면(AnalyzingStep)에서
// 검증 리포트(ReportStep)로 넘어가는 순간, 리포트 화면 위에 겹쳐 뜨는 "연속 출석 실패" 안내 모달.
// 좌표는 카드(node 487:543, x:33 y:204 w:331.67 h:413) 원점 기준 상대값을 그대로 옮겼다.
// 두 CTA 버튼은 실제 재개/재시작 백엔드 로직이 없어(위 STREAK_MODAL 상수 주석 참고) 모달을
// 닫기만 한다.
function StreakBrokenModal({ onDismiss }: { onDismiss: () => void }) {
  const [fontsLoaded] = useFonts(STREAK_MODAL_FONTS);
  // 폰트 로드 전엔 아예 렌더하지 않는다 — 시스템 폰트로 잠깐 렌더돼 타이틀이 줄바꿈되는 걸 막는다.
  if (!fontsLoaded) return null;

  return (
    <Pressable style={styles.streakModalBackdrop} onPress={onDismiss}>
      {/* 카드 자체는 탭해도 안 닫히도록 backdrop과 별개 Pressable로 감싼다(이벤트 버블 차단). */}
      <Pressable style={styles.streakModalCard} onPress={() => {}}>
        <Text style={styles.streakModalTitle}>아차! 연속 출석에 실패했어요</Text>
        <Text style={styles.streakModalSubtitle}>다시 출석한다면 다시 얻을 수 있어요.</Text>

        <View style={styles.streakModalPanel} />

        {/* 요일 배지 5개 (node 487:246/247/252/269/271) */}
        <View style={styles.streakModalDayRow}>
          {STREAK_MODAL_DAYS.map((day, index) => (
            <View key={index} style={styles.streakModalDayItem}>
              <View
                style={[
                  styles.streakModalDayCircle,
                  day.state === 'done' && styles.streakModalDayCircleDone,
                  day.state === 'missed' && styles.streakModalDayCircleMissed,
                  day.state === 'pending' && styles.streakModalDayCirclePending,
                ]}>
                <Image
                  source={
                    day.state === 'done'
                      ? require('@/assets/images/figma-icon-streak-day-done.png')
                      : day.state === 'missed'
                        ? require('@/assets/images/figma-icon-streak-day-missed.png')
                        : require('@/assets/images/figma-icon-streak-day-pending.png')
                  }
                  style={styles.streakModalDayFace}
                  contentFit="contain"
                />
              </View>
              <Text
                style={[
                  styles.streakModalDayLabel,
                  day.state === 'missed' && styles.streakModalDayLabelMissed,
                ]}>
                {day.label}
              </Text>
            </View>
          ))}
        </View>

        {/* 4일째(실패 지점) 위 빨간 깃발 마커 (node 487:544) */}
        <Image
          source={require('@/assets/images/figma-icon-streak-flag.png')}
          style={styles.streakModalFlag}
          contentFit="contain"
        />

        {/* CTA (node 471:1032/1033) */}
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.streakModalPrimaryButton, pressed && styles.pressed]}>
          <Text style={styles.streakModalPrimaryButtonText}>이어서 4일차부터 도전하기</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [styles.streakModalSecondaryButton, pressed && styles.pressed]}>
          <Text style={styles.streakModalSecondaryButtonText}>1일차부터 다시 시작하기</Text>
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
    if (item.name !== 'index') router.push(item.href);
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
  // 셀피 로딩 화면(AnalyzingStep)에서 리포트(ReportStep)로 넘어가는 순간 한 번 뜨는 "연속 출석
  // 실패" 팝업(node 487:273) — 모달이 이 컴포넌트와 함께 매번 새로 마운트되므로(위 주석 참고)
  // true로 시작해도 매번 출입할 때마다 다시 뜬다.
  const [showStreakModal, setShowStreakModal] = useState(true);
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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: REPORT_BG }]}>
      <View style={canvasWrapperStyle}>
        <ThemedView style={[styles.canvas, canvasScaleStyle]}>
          <ReportStep data={verifyState.data} onClose={onClose} onFinish={onFinish} />
          {showStreakModal && <StreakBrokenModal onDismiss={() => setShowStreakModal(false)} />}
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
  // 카드(node 487:543, x:33 y:204 w:331.67 h:413, radius:35.8) — Figma는 배경에 blur(5.11px)
  // 프로스티드 글라스 효과를 쓰지만 RN 기본만으로는 재현이 번거로워 불투명 흰 배경 + 그림자로
  // 근사했다.
  streakModalCard: {
    position: 'absolute',
    left: 33,
    top: 204,
    width: 331.67,
    height: 413,
    backgroundColor: Colors.white,
    borderRadius: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  // "아차! 연속 출석에 실패했어요" (node 471:1028, 카드 원점 기준 x:28.5 y:45 w:256 h:25)
  streakModalTitle: {
    position: 'absolute',
    left: 28.5,
    top: 45,
    width: 256,
    fontSize: 20,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: STREAK_MODAL_TITLE,
  },
  // "다시 출석한다면 다시 얻을 수 있어요." (node 471:1029, x:28.5 y:79 w:246 h:19)
  streakModalSubtitle: {
    position: 'absolute',
    left: 28.5,
    top: 79,
    width: 246,
    fontSize: 15,
    fontFamily: PRETENDARD_REGULAR,
    color: STREAK_MODAL_SUBTITLE,
  },
  // 연한 블루 배경 패널 (node 471:1030, x:8.5 y:107 w:317 h:139, radius:9) — 요일 배지 행의 배경
  streakModalPanel: {
    position: 'absolute',
    left: 8.5,
    top: 107,
    width: 317,
    height: 139,
    backgroundColor: STREAK_MODAL_PANEL_BG,
    borderRadius: 9,
  },
  // 요일 배지 행 (node 487:246 등, x:15.84 y:133.58 w:286.25) — 5개 항목 균등 배치
  streakModalDayRow: {
    position: 'absolute',
    left: 15.84,
    top: 133.58,
    width: 286.25,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakModalDayItem: {
    width: 53.7,
    alignItems: 'center',
    gap: 6,
  },
  // 배지 원(53.7x53.7) — 상태별 배경/테두리는 인라인 스타일로 덧붙인다
  streakModalDayCircle: {
    width: 53.7,
    height: 53.7,
    borderRadius: 26.85,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  streakModalDayCircleDone: {
    backgroundColor: STREAK_MODAL_DAY_DONE_BG,
    borderWidth: 1.5,
    borderColor: STREAK_MODAL_DAY_DONE_BORDER,
  },
  streakModalDayCircleMissed: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: STREAK_MODAL_DAY_MISSED_BORDER,
  },
  streakModalDayCirclePending: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: STREAK_MODAL_DAY_PENDING_BORDER,
  },
  streakModalDayFace: {
    width: 40,
    height: 34,
  },
  streakModalDayLabel: {
    fontSize: 13,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: STREAK_MODAL_LABEL_MUTED,
  },
  streakModalDayLabelMissed: {
    color: STREAK_MODAL_DAY_MISSED_BORDER,
  },
  // 4일째(실패 지점) 위 빨간 깃발 마커 (node 487:544, 카드 원점 기준 x:222 y:116 w:14 h:14)
  streakModalFlag: {
    position: 'absolute',
    left: 222,
    top: 116,
    width: 14,
    height: 14,
  },
  // "이어서 4일차부터 도전하기" 버튼 (node 471:1032, x:21 y:261 w:283 h:55, radius:26)
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
  // "1일차부터 다시 시작하기" 버튼 (node 471:1033, x:21 y:331 w:283 h:55, radius:26)
  streakModalSecondaryButton: {
    position: 'absolute',
    left: 21,
    top: 331,
    width: 283,
    height: 55,
    borderRadius: 26,
    backgroundColor: STREAK_MODAL_SECONDARY_BTN_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakModalSecondaryButtonText: {
    fontSize: 16,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: STREAK_MODAL_TITLE,
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
  // 적중률 카드 (node 243:1507, padding: 20px 18px, fill: #F4F0FD, radius:20)
  // 타이틀과의 간격(y:221 - 타이틀 블록 하단 ≈15px).
  accuracyCard: {
    marginTop: 15,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: REPORT_ACCURACY_CARD_BG,
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
  // 원형 링 (node 243:1509/1510, 118x118)
  accuracyRingWrap: {
    width: 118,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accuracyRingImage: {
    position: 'absolute',
    width: 118,
    height: 118,
  },
  accuracyRingContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  accuracyRateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  // "84" (node 243:1513, Inter Bold 25.2px, letterSpacing:-0.0198em, #3366FF)
  accuracyRateText: {
    fontSize: 25.2,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: REPORT_BLUE,
  },
  // "%" (node 243:1514, Inter Bold 16px, letterSpacing:-0.0313em, #3366FF)
  accuracyRatePercent: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: REPORT_BLUE,
    marginBottom: 2,
  },
  // "예보 적중률" (node 243:1516, Inter SemiBold 11px, Dolphin)
  accuracyRateLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: REPORT_DOLPHIN,
  },
  // "+6%p" 필 (node 243:1518, padding: 3px 7px, fill: Tara, radius:8)
  accuracyDeltaPill: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: REPORT_TARA_BG,
  },
  // "+6%p" 텍스트 (node 243:1519, Inter Bold 11px, Mountain Meadow)
  accuracyDeltaText: {
    fontSize: 11,
    fontWeight: '700',
    color: REPORT_MEADOW,
  },
  // "div"(node 243:1520, gap:10)
  accuracyStreakColumn: {
    flex: 1,
    gap: 10,
  },
  // "8일 연속 검증 완료!" (node 243:1522, Inter SemiBold 15px, #031949)
  accuracyStreakTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: REPORT_NAVY,
  },
  // "div"(node 243:1523, gap:6)
  accuracyStreakRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  accuracyStreakBadgeGroup: {
    alignItems: 'center',
    gap: 5,
  },
  // 배지 원 (node 243:1525 등, 26x26, radius:13, fill: #C9DAFF)
  accuracyStreakBadgeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: REPORT_STREAK_BADGE_BG,
  },
  // "오늘" 배지만 fill: #3366FF (node 243:1550)
  accuracyStreakBadgeCircleToday: {
    backgroundColor: REPORT_BLUE,
  },
  accuracyStreakCheckIcon: {
    width: 12,
    height: 12,
  },
  accuracyStreakStarIcon: {
    width: 13,
    height: 13,
  },
  // "3일" 등 (node 243:1528 등, Inter Bold 10.5px, Manatee)
  accuracyStreakBadgeLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: REPORT_TEXT_MUTED,
  },
  // "오늘" 라벨만 Inter SemiBold(600) — 나머지 요일 라벨은 Bold(700) (node 243:1553 vs 243:1528 등)
  accuracyStreakBadgeLabelToday: {
    fontWeight: '600',
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
