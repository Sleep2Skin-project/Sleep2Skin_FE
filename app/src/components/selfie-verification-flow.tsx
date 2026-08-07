import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TAB_ITEMS, tabBarStyles, type TabItem } from '@/constants/tabs';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// HOME-05~14 셀피 검증 플로우 — 1) 촬영 → 2) 분석 중 → 3) 검증 리포트.
// 1단계(촬영, node 176:816 "셀피 화면")·2단계(분석 중, node 176:961 "셀피 로딩 화면")는
// Figma REST API로 좌표·색상·타이포·에셋을 그대로 옮겼고, 부모 테마와 무관하게 항상 Figma가
// 지정한 배경(1단계 다크 그라디언트 / 2단계 흰 배경)으로 렌더한다. 3단계(리포트)는 Figma 데이터가
// 없어 기존 로직/스타일을 그대로 둔다. 실제 카메라/LLM Vision 연동 전이라 촬영 화면은 플레이스홀더
// 프리뷰를 쓰고, 분석·리포트 값은 목업이다.

const ACCENT = '#3C87F7';
const SUCCESS = '#34C759';
const WARNING = '#FF9F0A';

// node 176:816 배경(linear-gradient(180deg, #191A28 0%, #0C0D15 100%))
const CAPTURE_BG_TOP = '#191A28';
const CAPTURE_BG_BOTTOM = '#0C0D15';
// "얼굴 위치를 프레임에 맞춥니다" 상태 배지·트래킹 도트·아웃라인에 쓰이는 시안 포인트 컬러.
const CAPTURE_CYAN = '#7EE6FF';
const CAPTURE_CYAN_BORDER = 'rgba(126, 230, 255, 0.9)';

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

const METRIC_STEP_DURATION_MS = 800;
const REPORT_TRANSITION_DELAY_MS = 400;
const ANALYSIS_TOTAL_MS = METRIC_STEP_DURATION_MS * 4;

type MetricStatus = 'pending' | 'active' | 'done';

const METRIC_ITEMS = [
  { key: 'barrier', label: '장벽 측정' },
  { key: 'oil', label: '유분 측정' },
  { key: 'darkCircle', label: '다크서클 측정' },
  { key: 'compare', label: '어제 예보와 대조' },
] as const;

// node 241:604 "iPhone 17 - 14 (검증 리포트)"의 비교 테이블(node 243:1683)은 3개 지표만 보여준다.
// 예보/실측 값은 기존 목업과 동일(순서대로 62/58, 78/81, 41/29)하고 라벨만 Figma에 맞춰 옮겼다.
const COMPARISON_ROWS = [
  { key: 'blood', label: '혈색', forecast: 62, actual: 58 },
  { key: 'barrier', label: '장벽', forecast: 78, actual: 81 },
  { key: 'darkCircle', label: '다크서클 회복', forecast: 41, actual: 29 },
] as const;
// 지표별 게이지 바(트랙+진행색+동그란 마커)가 Figma에서 행마다 다른 색의 플랫 벡터로 미리
// 그려져 있어, 값으로부터 동적으로 계산하는 대신 행 순서에 맞춰 에셋을 그대로 사용한다.
const COMPARISON_GAUGE_ASSETS = [
  require('@/assets/images/figma-icon-report-gauge-1.png'),
  require('@/assets/images/figma-icon-report-gauge-2.png'),
  require('@/assets/images/figma-icon-report-gauge-3.png'),
] as const;

// 최근 8일치 예보 적중률(%) — 마지막 값이 오늘, 연속 검증 배너(HOME-11)와 동일한 8일 기준.
const WEEKLY_ACCURACY = [46, 58, 51, 70, 62, 65, 74, 84] as const;
const ACCURACY_RATE = WEEKLY_ACCURACY[WEEKLY_ACCURACY.length - 1];
const ACCURACY_DELTA = '+6%p';
const STREAK_DAYS = WEEKLY_ACCURACY.length;
// 스트릭 배지 라벨 (node 243:1524~1552) — "오늘"은 별도 별 배지로 렌더한다.
const STREAK_BADGE_DAYS = ['3일', '4일', '5일', '6일', '7일'] as const;

// node 241:604 "iPhone 17 - 14 (검증 리포트)" 전용 색상.
const REPORT_BG = '#DFEAFF';
const REPORT_TEXT_DARK = '#1A1A1A';
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

function getVerdict(forecast: number, actual: number) {
  const diff = Math.abs(forecast - actual);
  if (diff <= 4) return { label: '적중', icon: '◎', color: SUCCESS };
  if (diff <= 9) return { label: '근접', icon: '✓', color: ACCENT };
  return { label: forecast > actual ? '과대예측' : '과소예측', icon: '⚠', color: WARNING };
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
}: {
  scanning: boolean;
  scanTranslateY: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={styles.previewWrap}>
      <View style={styles.previewOuterRing} />

      <CornerBracket position="topLeft" />
      <CornerBracket position="topRight" />
      <CornerBracket position="bottomLeft" />
      <CornerBracket position="bottomRight" />

      <View style={styles.ovalGuideDotA} />
      <View style={styles.ovalGuideDotB} />
      <View style={styles.ovalGuideDotC} />

      <View style={styles.oval}>
        <View style={styles.ovalGray8Overlay} />
        <View style={styles.ovalDashedRing} />

        <View style={styles.ovalPlaceholderContent}>
          <Image
            source={require('@/assets/images/figma-icon-selfie-preview-placeholder.png')}
            style={styles.ovalPlaceholderGlyph}
            contentFit="contain"
          />
          <Text style={styles.ovalPlaceholderText}>카메라 미리보기 (사용자 얼굴)</Text>
        </View>

        {scanning && (
          <Animated.View
            pointerEvents="none"
            style={[styles.scanBarWrap, { transform: [{ translateY: scanTranslateY }] }]}>
            <View style={styles.scanGlow} />
            <View style={styles.scanLine} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

function CaptureStep({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  onCaptured: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CAPTURE_SECONDS);
  const [scanning, setScanning] = useState(false);
  const [scanAnim] = useState(() => new Animated.Value(0));
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (finished) onCaptured();
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

        <CapturePreview scanning={scanning} scanTranslateY={scanTranslateY} />

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
        <Text style={styles.captureDisclaimer}>촬영 원본은 저장되지 않습니다</Text>
      </View>
    </View>
  );
}

// node 176:963("div", 132x132) — 아바타 원(176:964) + 바깥 회전 링 에셋(176:977) + 트래킹 도트 3개(176:978/980/982).
function RotatingSelfieBadge({ rotateAnim }: { rotateAnim: Animated.Value }) {
  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.selfieBadgeWrap}>
      {/* 아바타 원 (node 176:964, x:6 y:6 w:120 h:120, fill: Athens Gray, radius:60) */}
      <View style={styles.selfieAvatarCircle}>
        <View style={styles.selfieAvatarOverlay} />
        <View style={styles.selfieAvatarDashedRing} />
        <View style={styles.selfieAvatarContent}>
          <Image
            source={require('@/assets/images/figma-icon-analyzing-preview-placeholder.png')}
            style={styles.selfieAvatarGlyph}
            contentFit="contain"
          />
          <Text style={styles.selfieAvatarText}>촬영된 셀피</Text>
        </View>
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
function AnalyzingStep({ onDone }: { onDone: () => void }) {
  const [statuses, setStatuses] = useState<MetricStatus[]>(() => METRIC_ITEMS.map(() => 'pending'));
  const [secondsLeft, setSecondsLeft] = useState(3);
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
    const timers: ReturnType<typeof setTimeout>[] = [];

    METRIC_ITEMS.forEach((_, index) => {
      timers.push(
        setTimeout(() => {
          setStatuses((prev) => prev.map((status, i) => (i === index ? 'active' : status)));
        }, index * METRIC_STEP_DURATION_MS),
      );
      timers.push(
        setTimeout(
          () => {
            setStatuses((prev) => prev.map((status, i) => (i === index ? 'done' : status)));
          },
          (index + 1) * METRIC_STEP_DURATION_MS,
        ),
      );
    });

    const secondsTimer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    const finishTimer = setTimeout(() => {
      onDone();
    }, ANALYSIS_TOTAL_MS + REPORT_TRANSITION_DELAY_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(secondsTimer);
      clearTimeout(finishTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.analyzingContainer}>
      {/* "div"(node 176:962, padding:56px 24px 0px, gap:20) — 배지/제목그룹/카드를 세로 중앙 정렬. */}
      <View style={styles.analyzingCenterGroup}>
        <RotatingSelfieBadge rotateAnim={rotateAnim} />

        {/* "div"(node 176:984, gap:5) */}
        <View style={styles.analyzingTitleGroup}>
          <Text style={styles.analyzingTitle}>피부 지표를 읽는 중</Text>
          <Text style={styles.analyzingSubtitle}>약 {secondsLeft}초 남았어요</Text>
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

// "84% 예보 적중률" 링 + "N일 연속 검증 완료!" 스트릭 배지 (node 243:1507).
function AccuracyCard() {
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
              <Text style={styles.accuracyRateText}>{ACCURACY_RATE}</Text>
              <Text style={styles.accuracyRatePercent}>%</Text>
            </View>
            <Text style={styles.accuracyRateLabel}>예보 적중률</Text>
            <View style={styles.accuracyDeltaPill}>
              <Text style={styles.accuracyDeltaText}>{ACCURACY_DELTA}</Text>
            </View>
          </View>
        </View>

        {/* 스트릭 배지 (node 243:1520) */}
        <View style={styles.accuracyStreakColumn}>
          <Text style={styles.accuracyStreakTitle}>{STREAK_DAYS}일 연속 검증 완료!</Text>
          <View style={styles.accuracyStreakRow}>
            {STREAK_BADGE_DAYS.map((label) => (
              <View key={label} style={styles.accuracyStreakBadgeGroup}>
                <View style={styles.accuracyStreakBadgeCircle}>
                  <Image
                    source={require('@/assets/images/figma-icon-report-streak-check.png')}
                    style={styles.accuracyStreakCheckIcon}
                    contentFit="contain"
                  />
                </View>
                <Text style={styles.accuracyStreakBadgeLabel}>{label}</Text>
              </View>
            ))}
            <View style={styles.accuracyStreakBadgeGroup}>
              <View style={[styles.accuracyStreakBadgeCircle, styles.accuracyStreakBadgeCircleToday]}>
                <Image
                  source={require('@/assets/images/figma-icon-report-streak-star.png')}
                  style={styles.accuracyStreakStarIcon}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.accuracyStreakBadgeLabel}>오늘</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// 지표 비교 행 (node 243:1691/1705/1719) — 게이지는 값 대신 행별 플랫 에셋을, 판정 아이콘은
// 기존 getVerdict() 임계값(diff<=9면 적중/근접, 그 외 과대·과소예측) 로직 그대로 사용해 선택한다.
function ComparisonRow({
  label,
  forecast,
  actual,
  gaugeSource,
}: {
  label: string;
  forecast: number;
  actual: number;
  gaugeSource: number;
}) {
  const verdict = getVerdict(forecast, actual);
  const isOk = Math.abs(forecast - actual) <= 9;

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
          source={
            isOk
              ? require('@/assets/images/figma-icon-report-verdict-ok.png')
              : require('@/assets/images/figma-icon-report-verdict-warn.png')
          }
          style={styles.comparisonVerdictIcon}
          contentFit="contain"
          accessibilityLabel={verdict.label}
        />
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
            <SymbolView name={{ ios: item.sf, android: item.android, web: item.android }} tintColor={theme[themeColor]} size={22} />
            <ThemedText type="small" themeColor={themeColor} style={tabBarStyles.label}>
              {item.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// node 241:604 "iPhone 17 - 14 (검증 리포트)" — 부모 테마와 무관하게 항상 Figma 지정
// 연한 파란 배경(#DFEAFF)으로 렌더한다.
function ReportStep({ onClose, onFinish }: { onClose: () => void; onFinish: () => void }) {
  const router = useRouter();
  const dateLabel = useMemo(() => {
    const now = new Date();
    const formatted = now.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    return `${formatted} · 셀피 검증`;
  }, []);

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

        {/* "어제 예보, 이만큼 맞았어요!" (node 243:1393, "이만큼"만 블루) */}
        <Text style={styles.reportTitle}>
          어제 예보,{'\n'}
          <Text style={styles.reportTitleAccent}>이만큼</Text> 맞았어요!
        </Text>

        <AccuracyCard />

        {/* 비교 테이블 (node 243:1683, w:362, radius:16, border: Pale Sky 22%) */}
        <View style={styles.comparisonSection}>
          <View style={styles.comparisonHeaderRow}>
            <Text style={[styles.comparisonHeaderLabel, styles.comparisonHeaderIndicatorCell]}>지표</Text>
            <View style={styles.comparisonHeaderMidGroup}>
              <Text style={styles.comparisonHeaderLabel}>예보</Text>
              <Text style={styles.comparisonHeaderLabel}>실측</Text>
            </View>
            <Text style={[styles.comparisonHeaderLabel, styles.comparisonHeaderVerdictCell]}>판정</Text>
          </View>

          {COMPARISON_ROWS.map((row, index) => (
            <View key={row.key}>
              <ComparisonRow
                label={row.label}
                forecast={row.forecast}
                actual={row.actual}
                gaugeSource={COMPARISON_GAUGE_ASSETS[index]}
              />
              {index < COMPARISON_ROWS.length - 1 && <View style={styles.comparisonRowDivider} />}
            </View>
          ))}
        </View>

        {/* 인사이트 (node 246:562/567/568) — 카드 배경 없이 페이지 위에 바로 배치 */}
        <View style={styles.insightSparklePill}>
          <Image
            source={require('@/assets/images/figma-icon-report-sparkle.png')}
            style={styles.insightSparkleIcon}
            contentFit="contain"
          />
        </View>
        <Text style={styles.insightTitle}>내 모델이 한 걸음 정밀해졌어요</Text>
        <Text style={styles.insightBody}>어제와 오늘 비교 데이터를 가시적으로 적어주기?</Text>
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
// 이 래퍼가 없으면 넓은 뷰포트(데스크톱 웹 미리보기 등)에서 모든 요소가 실제 기기 대비
// 작게 렌더돼, 텍스트 등 개별 수치는 Figma와 정확히 일치해도 전체 비율이 달라 보인다.
function SelfieFlowSteps({ onClose, onFinish }: SelfieFlowStepsProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const insets = useSafeAreaInsets();

  if (step === 1) {
    return (
      <View style={styles.screen}>
        <LinearGradient
          colors={[CAPTURE_BG_TOP, CAPTURE_BG_BOTTOM]}
          style={[styles.canvas, { marginTop: insets.top, marginBottom: insets.bottom }]}>
          <CaptureStep onClose={onClose} onCaptured={() => setStep(2)} />
        </LinearGradient>
      </View>
    );
  }

  if (step === 2) {
    return (
      <View style={styles.screen}>
        <ThemedView style={[styles.canvas, { marginTop: insets.top, marginBottom: insets.bottom }]}>
          <AnalyzingStep onDone={() => setStep(3)} />
        </ThemedView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ThemedView style={[styles.canvas, { marginTop: insets.top, marginBottom: insets.bottom }]}>
        <ReportStep onClose={onClose} onFinish={onFinish} />
      </ThemedView>
    </View>
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
  // 트래킹 도트 3개 (node 176:853/855/857, 6x6, fill:#7EE6FF + 글로우 섀도) — previewWrap 기준 절대좌표.
  ovalGuideDotA: {
    position: 'absolute',
    left: 38,
    top: 120,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
    shadowColor: CAPTURE_CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  ovalGuideDotB: {
    position: 'absolute',
    left: 198,
    top: 118,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
    shadowColor: CAPTURE_CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  ovalGuideDotC: {
    position: 'absolute',
    left: 116,
    top: 238,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CAPTURE_CYAN,
    shadowColor: CAPTURE_CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
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

  // 3단계: 검증 리포트 — node 241:604 "iPhone 17 - 14 (검증 리포트)"를 좌표 그대로 옮겼다.
  reportContainer: {
    flex: 1,
    backgroundColor: REPORT_BG,
  },
  // "div"(node 243:1383/1385) — 뒤로가기 + 타이틀.
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 31,
    paddingBottom: 8,
    paddingHorizontal: 13,
  },
  reportBackButton: {
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
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: REPORT_TEXT_DARK,
  },
  reportScroll: {
    flex: 1,
  },
  reportScrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
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
  reportTitle: {
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
  accuracyCard: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: REPORT_ACCURACY_CARD_BG,
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
  // 비교 테이블 (node 243:1683, w:362, padding: 7px 17px 5px, border: Pale Sky 22%, radius:16)
  comparisonSection: {
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
  // "혈색"/"장벽"/"다크서클 회복" (Inter Bold 16px, Cod Gray)
  comparisonLabel: {
    flex: 1.2,
    fontSize: 16,
    fontWeight: '700',
    color: REPORT_TEXT_DARK,
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
  // 실측 값 (Inter Bold 15px, Cod Gray)
  comparisonActualValue: {
    fontSize: 15,
    fontWeight: '700',
    color: REPORT_TEXT_DARK,
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
  // 인사이트 스파클 필 (node 246:562, padding: 3px 9px, fill: Blue Ribbon 10%, radius: pill)
  insightSparklePill: {
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
  // "내 모델이 한 걸음 정밀해졌어요" (node 246:567, Inter Bold 13.56px, Cod Gray)
  insightTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: REPORT_TEXT_DARK,
  },
  // "어제와 오늘 비교 데이터를..." (node 246:569, Inter Regular 12.55px, lineHeight:20.08px, Tuna 61%)
  insightBody: {
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
