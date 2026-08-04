import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// HOME-05~14 셀피 검증 플로우 — docs/selfie.png 와이어프레임 3장을 그대로 따른다.
// 1) 촬영 → 2) 분석 중 → 3) 검증 리포트. 실제 카메라/LLM Vision 연동 전이라
// 촬영 화면은 플레이스홀더 프리뷰를 쓰고, 분석·리포트 값은 목업이다.

const ACCENT = '#3C87F7';
const SUCCESS = '#34C759';
const WARNING = '#FF9F0A';
const CAPTURE_BG = '#0B0C10';

const AUTO_CAPTURE_SECONDS = 5;
const SCAN_DURATION_MS = 1500;
const OVAL_WIDTH = 260;
const OVAL_HEIGHT = 340;

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

const COMPARISON_ROWS = [
  { key: 'barrier', label: '장벽', forecast: 62, actual: 58 },
  { key: 'oil', label: '유분', forecast: 78, actual: 81 },
  { key: 'darkCircle', label: '다크서클', forecast: 41, actual: 29 },
  { key: 'dullness', label: '칙칙함', forecast: 55, actual: 57 },
] as const;

// 최근 8일치 예보 적중률(%) — 마지막 값이 오늘, 연속 검증 배너(HOME-11)와 동일한 8일 기준.
const WEEKLY_ACCURACY = [46, 58, 51, 70, 62, 65, 74, 84] as const;
const ACCURACY_RATE = WEEKLY_ACCURACY[WEEKLY_ACCURACY.length - 1];
const ACCURACY_DELTA = '+6%p';
const STREAK_DAYS = WEEKLY_ACCURACY.length;

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
function CapturePreview({
  scanning,
  scanTranslateY,
}: {
  scanning: boolean;
  scanTranslateY: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={styles.ovalFrame}>
      <CornerBracket position="topLeft" />
      <CornerBracket position="topRight" />
      <CornerBracket position="bottomLeft" />
      <CornerBracket position="bottomRight" />

      <View style={styles.oval}>
        <View style={styles.ovalGuideDot} />
        <View style={[styles.ovalGuideDot, styles.ovalGuideDotRight]} />
        <View style={[styles.ovalGuideDot, styles.ovalGuideDotBottom]} />

        <View style={styles.ovalPlaceholderIcon}>
          <ThemedText style={styles.ovalPlaceholderGlyph}>▧</ThemedText>
        </View>
        <ThemedText style={styles.ovalPlaceholderText}>카메라 미리보기 (사용자 얼굴)</ThemedText>

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
      <View style={styles.captureHeaderRow}>
        <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText style={styles.captureCloseText}>✕ 닫기</ThemedText>
        </Pressable>
        <View style={styles.aiPill}>
          <ThemedText style={styles.aiPillText}>✦ AI 얼굴 정렬</ThemedText>
        </View>
      </View>

      <View style={styles.captureBody}>
        <View style={styles.captureCopy}>
          <ThemedText style={styles.captureTitle}>밝은 곳에서 정면을 바라봐 주세요</ThemedText>
          <ThemedText style={styles.captureSubtitle}>얼굴이 가이드에 맞춰지면 자동으로 촬영돼요</ThemedText>
        </View>

        <CapturePreview scanning={scanning} scanTranslateY={scanTranslateY} />

        <View style={styles.statusPillRow}>
          <View style={styles.statusPill}>
            <View style={styles.statusPillDot} />
            <ThemedText style={styles.statusPillText}>조도 양호</ThemedText>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusPillDot} />
            <ThemedText style={styles.statusPillText}>정면 정렬됨</ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.captureFooter}>
        <ThemedText style={styles.autoCaptureText}>
          {scanning ? '촬영 중…' : `${secondsLeft}초 후 자동 촬영`}
        </ThemedText>
        <Pressable
          onPress={startCapture}
          disabled={scanning}
          style={({ pressed }) => [styles.shutterButton, (pressed || scanning) && styles.pressed]}>
          <View style={styles.shutterInner} />
        </Pressable>
        <ThemedText style={styles.captureDisclaimer}>촬영 원본은 저장되지 않습니다</ThemedText>
      </View>
    </View>
  );
}

function RotatingSelfieBadge({ rotateAnim }: { rotateAnim: Animated.Value }) {
  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.selfieBadgeWrap}>
      <Animated.View style={[styles.selfieDashedRing, { transform: [{ rotate }] }]}>
        <View style={[styles.selfieOrbitDot, styles.selfieOrbitDotA]} />
        <View style={[styles.selfieOrbitDot, styles.selfieOrbitDotB]} />
      </Animated.View>
      <ThemedView type="backgroundElement" style={styles.selfieCircle}>
        <ThemedText style={styles.selfieCircleGlyph}>▧</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          촬영된 셀피
        </ThemedText>
      </ThemedView>
    </View>
  );
}

function MetricStatusBadge({ status }: { status: MetricStatus }) {
  if (status === 'done') {
    return (
      <View style={styles.metricStatusRow}>
        <View style={styles.metricCheckCircle}>
          <ThemedText style={styles.metricCheckGlyph}>✓</ThemedText>
        </View>
        <ThemedText type="smallBold" style={styles.metricDoneLabel}>
          완료
        </ThemedText>
      </View>
    );
  }
  if (status === 'active') {
    return (
      <View style={styles.metricStatusRow}>
        <ActivityIndicator size="small" color={ACCENT} />
        <ThemedText type="small" style={styles.metricActiveLabel}>
          진행 중
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={styles.metricStatusRow}>
      <ThemedText themeColor="textSecondary" style={styles.metricPendingGlyph}>
        ⏳
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        대기
      </ThemedText>
    </View>
  );
}

function AnalyzingStep({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
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
      <View style={styles.analyzingHero}>
        <RotatingSelfieBadge rotateAnim={rotateAnim} />
        <ThemedText style={styles.analyzingTitle}>피부 지표를 읽는 중</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.analyzingSubtitle}>
          약 {secondsLeft}초 남았어요
        </ThemedText>
      </View>

      <ThemedView type="backgroundElement" style={styles.metricList}>
        {METRIC_ITEMS.map((item, index) => (
          <View key={item.key}>
            <View style={styles.metricRow}>
              <ThemedText type="default">{item.label}</ThemedText>
              <MetricStatusBadge status={statuses[index]} />
            </View>
            {index < METRIC_ITEMS.length - 1 && (
              <View style={[styles.metricDivider, { backgroundColor: theme.backgroundSelected }]} />
            )}
          </View>
        ))}
      </ThemedView>

      <View style={styles.analyzingFooter}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          분석이 끝나는 즉시 리포트로 이동합니다.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          지난 7일보다 예보 정확도가 좋아지고 있어요
        </ThemedText>
      </View>
    </View>
  );
}

function AccuracyCard() {
  return (
    <View style={styles.accuracyCard}>
      <View style={styles.accuracyHeaderRow}>
        <ThemedText style={styles.accuracyHeaderLabel}>오늘의 예보 적중률</ThemedText>
        <ThemedText style={styles.accuracyStreakLabel}>
          {STREAK_DAYS}일 연속{'\n'}검증 완료
        </ThemedText>
      </View>

      <View style={styles.accuracyRateRow}>
        <ThemedText style={styles.accuracyRateText}>{ACCURACY_RATE}%</ThemedText>
        <View style={styles.accuracyDeltaPill}>
          <ThemedText style={styles.accuracyDeltaText}>{ACCURACY_DELTA}</ThemedText>
        </View>
      </View>

      <View style={styles.accuracyBarsRow}>
        {WEEKLY_ACCURACY.map((value, index) => {
          const isToday = index === WEEKLY_ACCURACY.length - 1;
          return (
            <View
              key={index}
              style={[
                styles.accuracyBar,
                { height: 8 + (value / 100) * 20 },
                isToday ? styles.accuracyBarToday : styles.accuracyBarPast,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function ComparisonRow({ label, forecast, actual }: { label: string; forecast: number; actual: number }) {
  const theme = useTheme();
  const verdict = getVerdict(forecast, actual);
  const rangeLeft = Math.min(forecast, actual);
  const rangeWidth = Math.max(1, Math.abs(actual - forecast));

  return (
    <View style={styles.comparisonRow}>
      <ThemedText type="smallBold" style={styles.comparisonLabel}>
        {label}
      </ThemedText>

      <View style={styles.comparisonTrackArea}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.comparisonForecastValue}>
          {forecast}
        </ThemedText>
        <View style={[styles.comparisonTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.comparisonRange,
              { left: `${rangeLeft}%`, width: `${rangeWidth}%`, backgroundColor: verdict.color },
            ]}
          />
          <View
            style={[
              styles.comparisonDot,
              styles.comparisonDotForecast,
              { left: `${forecast}%`, borderColor: theme.textSecondary },
            ]}
          />
          <View
            style={[styles.comparisonDot, { left: `${actual}%`, backgroundColor: verdict.color }]}
          />
        </View>
        <ThemedText type="smallBold" style={styles.comparisonActualValue}>
          {actual}
        </ThemedText>
      </View>

      <ThemedText style={[styles.comparisonVerdictIcon, { color: verdict.color }]}>{verdict.icon}</ThemedText>
    </View>
  );
}

function ReportStep({ onClose, onFinish }: { onClose: () => void; onFinish: () => void }) {
  const theme = useTheme();

  const dateLabel = useMemo(() => {
    const now = new Date();
    const formatted = now.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
    return `${formatted} · 셀피 검증`;
  }, []);

  return (
    <View style={styles.reportContainer}>
      <View style={styles.reportHeaderRow}>
        <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText style={styles.reportBackChevron}>‹</ThemedText>
        </Pressable>
        <ThemedText type="smallBold">검증 리포트</ThemedText>
        <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText themeColor="textSecondary" style={styles.reportMoreIcon}>
            •••
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={styles.reportScroll}
        contentContainerStyle={styles.reportScrollContent}
        showsVerticalScrollIndicator={false}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.reportDateLabel}>
          📅 {dateLabel}
        </ThemedText>

        <ThemedText style={styles.reportTitle}>어제 예보,{'\n'}이만큼 맞았어요</ThemedText>

        <AccuracyCard />

        <ThemedView type="backgroundElement" style={styles.comparisonSection}>
          <View style={styles.comparisonHeaderRow}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.comparisonLabel}>
              지표
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.comparisonTrackArea}>
              예보 · 실측
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.comparisonVerdictHeader}>
              판정
            </ThemedText>
          </View>

          {COMPARISON_ROWS.map((row, index) => (
            <View key={row.key}>
              <ComparisonRow label={row.label} forecast={row.forecast} actual={row.actual} />
              {index < COMPARISON_ROWS.length - 1 && (
                <View style={[styles.metricDivider, { backgroundColor: theme.backgroundSelected }]} />
              )}
            </View>
          ))}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.insightCard}>
          <ThemedText style={styles.insightIcon}>✎</ThemedText>
          <View style={styles.insightTextGroup}>
            <ThemedText type="smallBold">내 모델이 한 걸음 정밀해졌어요</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              다크서클 예측 오차가 12%p 줄었어요 · 내일 예보부터 반영돼요
            </ThemedText>
          </View>
        </ThemedView>
      </ScrollView>

      <View style={styles.reportFooter}>
        <Pressable onPress={onFinish} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="text" style={styles.reportCtaButton}>
            <ThemedText themeColor="background" style={styles.reportCtaText}>
              오늘의 스킨케어 처방 보기 →
            </ThemedText>
          </ThemedView>
        </Pressable>
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
function SelfieFlowSteps({ onClose, onFinish }: SelfieFlowStepsProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const insets = useSafeAreaInsets();

  if (step === 1) {
    return (
      <View style={[styles.captureScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CaptureStep onClose={onClose} onCaptured={() => setStep(2)} />
      </View>
    );
  }

  if (step === 2) {
    return (
      <ThemedView style={[styles.reportScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AnalyzingStep onDone={() => setStep(3)} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.reportScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ReportStep onClose={onClose} onFinish={onFinish} />
    </ThemedView>
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

const cornerPositionStyles = StyleSheet.create({
  topLeft: { top: 0, left: 0, borderLeftWidth: 2, borderTopWidth: 2 },
  topRight: { top: 0, right: 0, borderRightWidth: 2, borderTopWidth: 2 },
  bottomLeft: { bottom: 0, left: 0, borderLeftWidth: 2, borderBottomWidth: 2 },
  bottomRight: { bottom: 0, right: 0, borderRightWidth: 2, borderBottomWidth: 2 },
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  centerText: {
    textAlign: 'center',
  },

  // 공통 화면 셸
  captureScreen: {
    flex: 1,
    backgroundColor: CAPTURE_BG,
  },
  reportScreen: {
    flex: 1,
  },

  // 1단계: 촬영
  captureContainer: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  captureHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  captureCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  aiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
    backgroundColor: 'rgba(60, 135, 247, 0.18)',
  },
  aiPillText: {
    color: ACCENT,
    fontSize: 13,
    fontWeight: '600',
  },
  captureBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  captureCopy: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  captureTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  captureSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    textAlign: 'center',
  },
  ovalFrame: {
    width: OVAL_WIDTH + 48,
    height: OVAL_HEIGHT + 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerBracket: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ovalGuideDot: {
    position: 'absolute',
    top: '28%',
    left: '22%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SUCCESS,
  },
  ovalGuideDotRight: {
    left: undefined,
    right: '22%',
    top: '24%',
  },
  ovalGuideDotBottom: {
    top: undefined,
    bottom: '18%',
    left: '48%',
  },
  ovalPlaceholderIcon: {
    marginBottom: Spacing.one,
  },
  ovalPlaceholderGlyph: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 28,
  },
  ovalPlaceholderText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    maxWidth: 160,
    textAlign: 'center',
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
    backgroundColor: 'rgba(60, 135, 247, 0.22)',
  },
  scanLine: {
    width: '100%',
    height: 2,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  statusPillRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
    backgroundColor: 'rgba(52, 199, 89, 0.16)',
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SUCCESS,
  },
  statusPillText: {
    color: SUCCESS,
    fontSize: 12,
    fontWeight: '600',
  },
  captureFooter: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  autoCaptureText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  captureDisclaimer: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
  },

  // 2단계: 분석 중
  analyzingContainer: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    gap: Spacing.five,
  },
  analyzingHero: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  selfieBadgeWrap: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  selfieDashedRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: ACCENT,
  },
  selfieOrbitDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SUCCESS,
  },
  selfieOrbitDotA: {
    top: -4,
    left: 14,
  },
  selfieOrbitDotB: {
    bottom: 10,
    right: -4,
  },
  selfieCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  selfieCircleGlyph: {
    fontSize: 20,
  },
  analyzingTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  analyzingSubtitle: {
    fontSize: 13,
  },
  metricList: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  metricDivider: {
    height: StyleSheet.hairlineWidth,
  },
  metricStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  metricPendingGlyph: {
    fontSize: 14,
  },
  metricActiveLabel: {
    color: ACCENT,
  },
  metricCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: SUCCESS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCheckGlyph: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  metricDoneLabel: {
    color: SUCCESS,
  },
  analyzingFooter: {
    marginTop: 'auto',
    gap: Spacing.half,
    paddingBottom: Spacing.four,
  },

  // 3단계: 검증 리포트
  reportContainer: {
    flex: 1,
  },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  reportBackChevron: {
    fontSize: 28,
    lineHeight: 28,
  },
  reportMoreIcon: {
    fontSize: 18,
    letterSpacing: 1,
  },
  reportScroll: {
    flex: 1,
  },
  reportScrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  reportDateLabel: {
    fontSize: 13,
  },
  reportTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
  },
  accuracyCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    backgroundColor: '#14161C',
  },
  accuracyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  accuracyHeaderLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
  },
  accuracyStreakLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    textAlign: 'right',
    lineHeight: 15,
  },
  accuracyRateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  accuracyRateText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
  },
  accuracyDeltaPill: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
    backgroundColor: 'rgba(52, 199, 89, 0.22)',
  },
  accuracyDeltaText: {
    color: SUCCESS,
    fontSize: 13,
    fontWeight: '700',
  },
  accuracyBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  accuracyBar: {
    flex: 1,
    borderRadius: 3,
  },
  accuracyBarPast: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  accuracyBarToday: {
    backgroundColor: ACCENT,
  },
  comparisonSection: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  comparisonHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
  comparisonLabel: {
    width: 52,
  },
  comparisonTrackArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  comparisonForecastValue: {
    width: 22,
    textAlign: 'right',
  },
  comparisonActualValue: {
    width: 22,
  },
  comparisonTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  comparisonRange: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    opacity: 0.35,
  },
  comparisonDot: {
    position: 'absolute',
    top: '50%',
    width: 10,
    height: 10,
    marginTop: -5,
    marginLeft: -5,
    borderRadius: 5,
  },
  comparisonDotForecast: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  comparisonVerdictHeader: {
    width: 28,
    textAlign: 'center',
  },
  comparisonVerdictIcon: {
    width: 28,
    textAlign: 'center',
    fontSize: 15,
  },
  insightCard: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  insightIcon: {
    fontSize: 16,
  },
  insightTextGroup: {
    flex: 1,
    gap: Spacing.half,
  },
  reportFooter: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  reportCtaButton: {
    height: 53,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCtaText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
