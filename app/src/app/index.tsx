import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getSkinForecast,
  getSkinModel,
  getVerificationSummary,
  SkinModelUserNotFoundError,
  type SkinForecastDetail,
  type VerificationSummary,
} from '@/api/skin';
import { getSleepInterpretation, type SleepInterpretation } from '@/api/sleep';
import { SelfieVerificationFlow } from '@/components/selfie-verification-flow';
import { SleepDetailModal } from '@/components/sleep-detail-modal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { HOME_SUMMARY_MOCK } from '@/constants/mockData';
import { useDesignScale } from '@/hooks/use-design-scale';

// HOME — Figma 'Ui' 파일 노드 187:2673("홈 화면")을 Figma REST API로 직접 읽어와
// 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것.
// 피부 예보/수면 통역/적중률·연속 검증 배너는 GET /api/v1/skin/forecast, /api/v1/sleep/interpretation,
// GET /api/v1/skin/verification/summary로 연동했고, 날짜/인사말/레벨처럼 대응하는 API가 아직
// 없는 항목만 mockData.ts의 HOME_SUMMARY_MOCK을 그대로 쓴다.
// 좌표는 모두 프레임(node 187:2673) 원점 기준 상대값이며, 값은 Figma가 반환한 절대좌표에서 프레임 원점을 뺀 것이다.
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링).
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

// 레벨 트랙 폭(w:95.4) — Figma 원본 px 값을 그대로 사용. 채움 폭은 mock의 progressPercent로 계산한다.
const LEVEL_TRACK_WIDTH = 95.4;

const VERIFY_BUTTON_LABEL = '5초 셀피로 오늘 예보 검증하기';
const UNAVAILABLE_METRIC_COLOR = '#9E9E9E';

const FORECAST_METRIC_LABELS = {
  darkCircle: '다크서클',
  complexion: '안색',
  barrier: '장벽',
} as const;

type ForecastState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string }
  | { status: 'available'; forecast: SkinForecastDetail };

type InterpretationState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string }
  | { status: 'available'; interpretation: SleepInterpretation };

type VerificationSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string | null }
  | { status: 'available'; summary: VerificationSummary };

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** grade는 백엔드가 자유 문자열로 내려줘 고정 enum이 없다 — 흔한 위험/주의 키워드만 색으로 매칭하고 나머지는 안전으로 취급한다. */
function gradeToColor(grade: string): string {
  const normalized = grade.toUpperCase();
  if (normalized.includes('위험') || normalized.includes('DANGER') || normalized.includes('BAD')) {
    return Colors.danger;
  }
  if (
    normalized.includes('주의') ||
    normalized.includes('경고') ||
    normalized.includes('WARN') ||
    normalized.includes('CAUTION')
  ) {
    return Colors.warning;
  }
  return Colors.success;
}

function buildForecastRows(forecast: SkinForecastDetail) {
  const entries: [key: keyof typeof FORECAST_METRIC_LABELS, metric: SkinForecastDetail['darkCircle'] | null][] = [
    ['darkCircle', forecast.darkCircle],
    ['complexion', forecast.complexion],
    ['barrier', forecast.barrier],
  ];
  return entries.map(([key, metric]) => ({
    key,
    label: FORECAST_METRIC_LABELS[key],
    value: metric?.score ?? 0,
    status: metric?.grade ?? '측정 불가',
    color: metric ? gradeToColor(metric.grade) : UNAVAILABLE_METRIC_COLOR,
  }));
}

function buildTooltipLines(state: InterpretationState): string[] {
  if (state.status === 'loading') return ['불러오는 중...'];
  if (state.status === 'error') return ['수면 통역을 불러오지 못했어요'];
  if (state.status === 'no_data') return [state.message];
  const { interpretation } = state;
  return interpretation.tone === 'PRAISE'
    ? [interpretation.headline]
    : [interpretation.headline, interpretation.focus.label];
}

/**
 * 검증 트리거 아래 한 줄 요약(HOME-09, getVerificationSummary). summary.hitRate는 누적 적중률이라
 * AccuracyCard(selfie-verification-flow.tsx)와 동일하게 "누적"이라 명시하고, latest.hitRate(그날치)와
 * 섞어 쓰지 않는다.
 */
function buildVerificationSummaryText(state: VerificationSummaryState): string {
  if (state.status === 'loading') return '불러오는 중...';
  if (state.status === 'error') return '적중률 정보를 불러오지 못했어요';
  if (state.status === 'no_data') {
    return state.message ?? '아직 검증 이력이 없어요 · 셀피로 첫 검증을 시작해보세요';
  }
  const { summary } = state;
  return summary.streakCount > 0
    ? `누적 예보 적중률 ${summary.hitRate}% · ${summary.streakCount}일 연속 검증 중`
    : `누적 예보 적중률 ${summary.hitRate}% · 오늘 검증하고 기록을 이어가 보세요`;
}

function ForecastGaugeRow({
  label,
  value,
  status,
  statusColor,
}: {
  label: string;
  value: number;
  status: string;
  statusColor: string;
}) {
  return (
    <View style={styles.gaugeRow}>
      <ThemedText style={styles.gaugeLabel}>{label}</ThemedText>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${value}%` }]} />
      </View>
      <ThemedText style={styles.gaugeValue}>
        {value} · <ThemedText style={[styles.gaugeStatus, { color: statusColor }]}>{status}</ThemedText>
      </ThemedText>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [selfieFlowVisible, setSelfieFlowVisible] = useState(false);
  const [forecastState, setForecastState] = useState<ForecastState>({ status: 'loading' });
  const [interpretationState, setInterpretationState] = useState<InterpretationState>({ status: 'loading' });
  const [verificationSummaryState, setVerificationSummaryState] = useState<VerificationSummaryState>({
    status: 'loading',
  });

  useEffect(() => {
    const baseDate = getTodayDateString();

    getSkinForecast(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        setForecastState(
          data.status === 'AVAILABLE'
            ? { status: 'available', forecast: data.forecast }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch(() => setForecastState({ status: 'error' }));

    getSleepInterpretation(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        setInterpretationState(
          data.status === 'AVAILABLE'
            ? { status: 'available', interpretation: data.interpretation }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch(() => setInterpretationState({ status: 'error' }));

    // REP-12 테스트 호출: 내 모델 - 일반 vs 개인화 (userId: 1 고정)
    getSkinModel(1)
      .then(({ data }) => {
        if (data.status === 'NO_VERIFICATION') {
          console.log(
            `✅ 내 모델 조회 성공: 상태 NO_VERIFICATION (아직 검증 이력 없음, message: ${data.message ?? '없음'})`
          );
        } else {
          console.log(
            `✅ 내 모델 조회 성공: 상태 AVAILABLE (누적 검증 횟수: ${data.model.verificationCount}, 헤드라인: ${data.model.headline})`
          );
        }
      })
      .catch((error) => {
        if (error instanceof SkinModelUserNotFoundError) {
          console.error(`❌ 내 모델 조회 실패: 존재하지 않는 사용자 (userId: ${error.userId})`);
          return;
        }
        console.error('❌ 내 모델 조회 실패:', error);
      });

    // 테스트용 셀피 검증 호출: verifySelfie(1, "2026-08-07", "dummy_uri")
    // (카메라 기능 미구현으로 아직 호출하지 않음)

    // HOME-09: 적중률·연속 검증 배너 (검증 트리거 아래 한 줄 요약)
    getVerificationSummary(TEMP_USER_ID, baseDate)
      .then(({ data }) => {
        setVerificationSummaryState(
          data.status === 'AVAILABLE'
            ? { status: 'available', summary: data.summary }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch((error) => {
        if (error instanceof SkinModelUserNotFoundError) {
          console.error(`❌ 배너 조회 실패: 존재하지 않는 사용자 (userId: ${error.userId})`);
        } else {
          console.error('❌ 배너 조회 실패:', error);
        }
        setVerificationSummaryState({ status: 'error' });
      });
  }, []);

  return (
    <>
      <SafeAreaView style={styles.screen}>
        <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
            {/* 배경 (fill #DFEAFF) */}
            <View style={StyleSheet.absoluteFill} />

            {/* 상단 안내 문구 (날짜 + 인사말) */}
            <View style={styles.dateGreetingBlock}>
              <ThemedText style={styles.dateText}>{HOME_SUMMARY_MOCK.date.label}</ThemedText>
              <View style={styles.greetingRow}>
                <Image source={require('@/assets/images/figma-icon-sun.png')} style={styles.sunIcon} contentFit="contain" />
                <ThemedText style={styles.greetingText}>{HOME_SUMMARY_MOCK.greeting.message}</ThemedText>
              </View>
            </View>

            {/* 캐릭터 레벨 */}
            <ThemedText style={styles.levelText}>LEVEL. {HOME_SUMMARY_MOCK.level.current}</ThemedText>
            <View style={styles.levelTrack}>
              <View style={[styles.levelFill, { width: `${HOME_SUMMARY_MOCK.level.progressPercent}%` }]} />
            </View>

            {/* 캐릭터 */}
            <Image
              source={require('@/assets/images/figma-character.png')}
              style={styles.characterImage}
              contentFit="contain"
            />

            {/* 수면 요약 툴팁 카드 */}
            <Pressable onPress={() => router.push('/report')} style={({ pressed }) => [pressed && styles.pressed]}>
              <LinearGradient
                style={styles.tooltipCard}
                colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.22)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}>
                <View style={styles.tooltipIconSlot} />
                <View style={styles.tooltipTextBlock}>
                  {buildTooltipLines(interpretationState).map((line, index) => (
                    <ThemedText key={index} style={styles.tooltipText}>
                      {line}
                    </ThemedText>
                  ))}
                </View>
              </LinearGradient>
            </Pressable>
            <Image source={require('@/assets/images/figma-icon-bed.png')} style={styles.tooltipIcon} contentFit="contain" />

            {/* 오늘의 피부 예보 카드 */}
            <View style={styles.forecastCard}>
              <View style={styles.forecastTitleRow}>
                <Image
                  source={require('@/assets/images/figma-icon-barchart.png')}
                  style={styles.forecastTitleIcon}
                  contentFit="contain"
                />
                <ThemedText style={styles.forecastTitle}>{HOME_SUMMARY_MOCK.skinForecast.title}</ThemedText>
              </View>
              {forecastState.status === 'loading' && (
                <ThemedText style={styles.forecastDisclaimer}>불러오는 중...</ThemedText>
              )}
              {forecastState.status === 'error' && (
                <ThemedText style={styles.forecastDisclaimer}>피부 예보를 불러오지 못했어요</ThemedText>
              )}
              {forecastState.status === 'no_data' && (
                <ThemedText style={styles.forecastDisclaimer}>{forecastState.message}</ThemedText>
              )}
              {forecastState.status === 'available' && (
                <View style={styles.gaugeList}>
                  {buildForecastRows(forecastState.forecast).map((item) => (
                    <ForecastGaugeRow
                      key={item.key}
                      label={item.label}
                      value={item.value}
                      status={item.status}
                      statusColor={item.color}
                    />
                  ))}
                </View>
              )}
              <ThemedText style={styles.forecastDisclaimer}>{HOME_SUMMARY_MOCK.skinForecast.disclaimer}</ThemedText>
            </View>

            {/* 검증 버튼 + 트리거 */}
            <Pressable onPress={() => setSelfieFlowVisible(true)} style={({ pressed }) => [styles.verifyButton, pressed && styles.pressed]}>
              <ThemedText style={styles.verifyButtonText}>{VERIFY_BUTTON_LABEL}</ThemedText>
            </Pressable>

            <View style={styles.verificationTrigger}>
              <ThemedText style={styles.verificationSummary}>
                {buildVerificationSummaryText(verificationSummaryState)}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setSleepModalVisible(true)}
              hitSlop={12}
              style={({ pressed }) => [styles.chevronIcon, pressed && styles.pressed]}>
              <Image
                source={require('@/assets/images/figma-icon-chevron-up.png')}
                style={styles.chevronImage}
                contentFit="contain"
              />
            </Pressable>

            <View style={styles.divider} />
          </View>
        </View>
      </SafeAreaView>

      <SleepDetailModal visible={sleepModalVisible} onClose={() => setSleepModalVisible(false)} />
      <SelfieVerificationFlow
        visible={selfieFlowVisible}
        onClose={() => setSelfieFlowVisible(false)}
        onFinish={() => {
          setSelfieFlowVisible(false);
          router.push('/todo');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  // 프레임(node 187:2673): 402x874, fill #DFEAFF
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: Colors.bgSoftBlue,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },

  // "8월 6일 목요일 좋은 아침이에요" (node 187:2710, x:31 y:55 w:195 h:68) — 혼합 스타일 텍스트 런
  dateGreetingBlock: {
    position: 'absolute',
    left: 31,
    top: 55,
  },
  dateText: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '400',
    color: '#646464',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  sunIcon: {
    width: 24,
    height: 24,
  },
  greetingText: {
    marginLeft: 8,
    fontSize: 25,
    lineHeight: 35,
    fontWeight: '700',
    color: '#000000',
  },
  // "LEVEL. 3" (node 187:2703, x:37 y:134 w:103.35 h:17.06)
  levelText: {
    position: 'absolute',
    left: 37,
    top: 134,
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  // 레벨 트랙 배경 value (node 187:2704, x:107.17 y:140.02 w:95.4 h:6.98, radius:5.82)
  levelTrack: {
    position: 'absolute',
    left: 107,
    top: 140,
    width: LEVEL_TRACK_WIDTH,
    height: 7,
    borderRadius: 6,
    backgroundColor: Colors.mutedGray,
    overflow: 'hidden',
  },
  // 레벨 트랙 채움 value (node 187:2705, x:107 y:140 w:34 h:7, radius:5.82)
  levelFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: Colors.primaryDark,
  },

  // ghost3-nobg-shadow (1) 1 (node 187:2678, x:-17 y:162 w:367 h:296)
  characterImage: {
    position: 'absolute',
    left: -17,
    top: 162,
    width: 367,
    height: 296,
  },

  // "div" 수면 요약 툴팁 카드 (node 187:2679, x:181 y:158 w:199 h:78, radius:25.3) — 목업 시절엔
  // "깊은 수면이" / "32분 부족했어요" 같은 짧은 2줄이었지만, 실제 API 메시지(특히 NO_SLEEP_DATA의
  // message)는 길이를 예측할 수 없어서 height를 고정하지 않고 minHeight로 바꿔 내용만큼 늘어나게
  // 했다. 아래로 481px(오늘의 피부 예보 카드)까지 충분히 여유가 있어 늘어나도 안 겹친다.
  tooltipCard: {
    position: 'absolute',
    left: 181,
    top: 158,
    width: 199,
    minHeight: 78,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 21,
    gap: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#5A6EA0',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 4,
  },
  // "span" 아이콘 슬롯 (node 187:2680, w:19 h:24) — 실제 아이콘은 Person In Bed 레이어로 위에 겹쳐 그린다.
  tooltipIconSlot: {
    width: 19,
    height: 24,
  },
  // 아이콘 옆 텍스트 칸 — flex:1로 카드 남은 폭 안에서만 줄바꿈되게 잡아준다(안 그러면 텍스트가
  // 카드 폭을 무시하고 옆으로 삐져나갈 수 있다).
  tooltipTextBlock: {
    flex: 1,
  },
  // 목업 2줄 문구 기준으로 16px이었는데, 실제 메시지는 한 문장으로 오는 경우가 많아 그대로 두면
  // 글자가 카드 밖으로 잘렸다. 폭 안에서 여러 줄로 편하게 접히도록 줄였다.
  tooltipText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#1C2430',
  },
  // Person In Bed (node 187:2702, x:198 y:186 w:27 h:27) — 프레임 루트의 독립 레이어(플로팅)
  tooltipIcon: {
    position: 'absolute',
    left: 198,
    top: 186,
    width: 27,
    height: 27,
  },

  // "오늘의 피부 예보" 카드 (node 187:2683, x:22 y:481 w:358 h:185.77, radius:16.6)
  forecastCard: {
    position: 'absolute',
    left: 22,
    top: 481,
    width: 358,
    height: 186,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderWidth: 1,
    borderColor: '#DCDCDC',
    padding: 19,
    gap: 12,
  },
  forecastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  forecastTitleIcon: {
    width: 22,
    height: 22,
  },
  forecastTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  gaugeList: {
    gap: 12,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeLabel: {
    width: 58,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#6B6B6B',
  },
  gaugeTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(181, 194, 207, 0.75)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primaryDark,
  },
  gaugeValue: {
    width: 86,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  gaugeStatus: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  forecastDisclaimer: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    color: '#9E9E9E',
  },

  // Button 인스턴스 (node 187:2675, x:29 y:686 w:345 h:52, radius:10)
  verifyButton: {
    position: 'absolute',
    left: 29,
    top: 686,
    width: 345,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
  verifyButtonText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.white,
  },

  // "어제 예보 적중률..." (node 187:2677, x:30 y:750 w:345 h:17)
  verificationTrigger: {
    position: 'absolute',
    left: 30,
    top: 750,
    width: 345,
    alignItems: 'center',
  },
  verificationSummary: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'center',
  },
  // Vector 쉐브론 (node 187:2706, x:190 y:774 w:23 h:13)
  chevronIcon: {
    position: 'absolute',
    left: 190,
    top: 774,
    width: 23,
    height: 13,
  },
  chevronImage: {
    width: '100%',
    height: '100%',
  },

  // Line 1 (node 187:2674, x:-12 y:800 w:440 h:0, stroke #C7C7C7)
  divider: {
    position: 'absolute',
    left: -12,
    top: 800,
    width: 440,
    height: 1,
    backgroundColor: '#C7C7C7',
  },
});
