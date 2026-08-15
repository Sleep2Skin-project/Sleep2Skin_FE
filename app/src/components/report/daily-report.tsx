import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getSkinForecast, type SkinForecastDetail } from '@/api/skin';
import type { SleepStats } from '@/api/sleep';
import { SleepScoreGamificationModal } from '@/components/report/sleep-score-gamification-modal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';

// 일간 리포트 (REP-02~05) — Figma 'Ui (복사)' 파일 node 350:698("리포트- 일간")을 Dev Mode 값
// (색상 hex/폰트/여백/radius) 그대로 옮긴 것. 탭 전환 세그먼트(일간/주간/월간/종합)와 하단 탭바는
// report.tsx/app-tabs.tsx가 소유하는 공용 UI라 이 파일에서는 건드리지 않는다.
// index.tsx/onboarding-flow.tsx와 달리 이 화면은 고정 캔버스에 절대좌표를 옮기지 않고, Figma가 준
// 좌표 간격을 padding/gap으로 환산해 Flexbox로 짜서 기기 폭에 반응형으로 채운다(카드 폭 등도 %/flex).
//
// "지난밤 수면 구간" 섹션(바/범례/지표 카드 일부)은 실제 POST /api/v1/sleep/sessions 응답의 sleep
// 필드(SleepStats, api/sleep.ts에 이미 정의된 실제 타입)와 정확히 같은 모양의 목업 객체 하나로
// 통일했다. HealthKit 연동 후에는 uploadSleepSession(...).then(res => setSleepStats(res.data.sleep))
// 처럼 SLEEP_STATS_MOCK 자리만 실제 응답 state로 바꿔 끼우면 바/범례/지표 카드가 전부 자동으로
// 맞게 다시 그려진다(스킨 예보를 API로 바꿨을 때와 동일한 패턴).
const DATE_RANGE_LABEL = '최근 7일 · 7/25 – 7/31';
const USER_HEADING = 'test1님의 어제';

const SLEEP_STATS_MOCK: SleepStats = {
  sleepOnsetTime: '2026-08-09T14:40:00Z', // UTC — KST 23:40
  wakeTime: '2026-08-09T22:10:00Z', // UTC — KST(다음날) 07:10
  totalSleepMinutes: 399, // deep + rem + core
  deepSleepMinutes: 126, // 2시간 6분
  remSleepMinutes: 202, // 3시간 22분
  coreSleepMinutes: 71, // 1시간 11분
  awakeCount: 2,
  awakeMinutes: 30,
};

// SleepStats에 없는 필드(입면 지연·수면 효율)는 백엔드에 추가되기 전까지 별도 목업으로 남겨둔다.
const SLEEP_EXTRA_STATS_MOCK = {
  latencyMinutes: 62,
  efficiencyPercent: 70,
};

// 게이미케이션(경험치) 팝업 트리거용 목업 — 연속 출석/경험치를 다루는 백엔드 API가 아직 없어서
// (API_SPEC.md 미등재) "어제보다 수면 점수가 올랐는지"를 실제로 계산할 방법이 없다. 그래서
// today/previous를 하드코딩해두고 today > previous일 때만 팝업을 띄우는 것으로 로직만 흉내 낸다.
// 실제 API가 생기면 이 목업 대신 응답의 오늘/어제 수면 점수와 지급 경험치 값을 쓸 것.
const SLEEP_SCORE_MOCK = { today: 86, previous: 70 };
const SLEEP_SCORE_EXP_MOCK = 10;
const SLEEP_SCORE_DATE_LABEL_MOCK = '26년 8월 14일';

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}분`;
  if (remainder === 0) return `${hours}시간`;
  return `${hours}시간 ${remainder}분`;
}

/** UTC ISO 문자열을 KST(UTC+9) "HH:mm"으로 포맷 — 기기 타임존과 무관하게 항상 한국 시각 기준. */
function formatTimeKST(isoUtc: string) {
  const kst = new Date(new Date(isoUtc).getTime() + 9 * 60 * 60 * 1000);
  const hours = String(kst.getUTCHours()).padStart(2, '0');
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// "stages" 바(node 350:705~714) 세그먼트 색상 — SleepStats 필드명(core/deep/rem/awake)과 1:1로
// 맞췄다(Figma 원본은 바 레이어명과 범례 라벨/색이 서로 어긋나 있었는데, 데이터 하나로 통일하면서
// 정리했다).
const STAGE_COLORS = {
  core: '#D1D9E9',
  deep: '#031949',
  rem: '#465B8B',
  awake: '#919CB3',
} as const;

export type SleepTimelineSegment = {
  key: string;
  stage: keyof typeof STAGE_COLORS;
  minutes: number;
};

// Figma가 준 9개 세그먼트(55.85:68.74:40.81:6.44:47.26:62.3:35.44:5.37:13.96)의 시각적 배열(어느
// 단계가 몇 조각으로 나뉘어 몇 번째에 오는지)만 그대로 두고, 각 조각 길이는 SLEEP_STATS_MOCK의
// 실제 분(minute)에서 비례 배분한다 — SleepTimelineBar의 flex 비율 "계산식" 자체는 손대지 않았고
// (변경 금지 지시 준수), 그 계산식에 넣어줄 숫자만 데이터에서 매번 다시 뽑아내도록 만들었다.
const TIMELINE_SHAPE: { key: string; stage: keyof typeof STAGE_COLORS; weightWithinStage: number }[] = [
  { key: '1', stage: 'core', weightWithinStage: 0.424 },
  { key: '2', stage: 'deep', weightWithinStage: 0.595 },
  { key: '3', stage: 'rem', weightWithinStage: 0.539 },
  { key: '4', stage: 'awake', weightWithinStage: 0.545 },
  { key: '5', stage: 'deep', weightWithinStage: 0.405 },
  { key: '6', stage: 'core', weightWithinStage: 0.47 },
  { key: '7', stage: 'rem', weightWithinStage: 0.461 },
  { key: '8', stage: 'awake', weightWithinStage: 0.455 },
  { key: '9', stage: 'core', weightWithinStage: 0.106 },
];

function buildTimelineSegments(stats: SleepStats): SleepTimelineSegment[] {
  const stageMinutes: Record<keyof typeof STAGE_COLORS, number> = {
    core: stats.coreSleepMinutes,
    deep: stats.deepSleepMinutes,
    rem: stats.remSleepMinutes,
    awake: stats.awakeMinutes,
  };
  return TIMELINE_SHAPE.map((piece) => ({
    key: piece.key,
    stage: piece.stage,
    minutes: piece.weightWithinStage * stageMinutes[piece.stage],
  }));
}

// 범례(node 350:715) — 바와 같은 4개 단계 색을 그대로 재사용하고("각성"만 횟수라 별도 빨강),
// 문구는 SleepStats에서 매번 계산해서 만든다.
type LegendItem = { key: string; color: string; label: string; icon?: 'ring' };

function buildLegendRows(stats: SleepStats): LegendItem[][] {
  return [
    [
      { key: 'deep', color: STAGE_COLORS.deep, label: `깊은 수면 ${formatDuration(stats.deepSleepMinutes)}` },
      { key: 'core', color: STAGE_COLORS.core, label: `코어수면 ${formatDuration(stats.coreSleepMinutes)}` },
    ],
    [
      { key: 'rem', color: STAGE_COLORS.rem, label: `REM 수면 ${formatDuration(stats.remSleepMinutes)}` },
      { key: 'nonSleep', color: STAGE_COLORS.awake, label: `비수면 ${formatDuration(stats.awakeMinutes)}` },
    ],
    [{ key: 'arousal', color: '#E52222', label: `각성 ${stats.awakeCount}회`, icon: 'ring' }],
  ];
}

// "각성" 발생 시점 마커 (node 350:786, 350:787) — 표시 개수는 awakeCount와 맞춰야 하지만, 정확한
// 발생 시각까지는 SleepStats에 없어서(집계값만 내려옴) 위치 자체는 Figma 좌표를 그대로 둔다.
const AROUSAL_MARKER_POSITIONS = [36.3, 64.3];

// 지표 카드 6개 (node 350:737~814) — 3열 x 2행, Figma 순서(좌→우, 상→하) 그대로.
// 총 수면/야간 각성/각성 시간/얕은 수면(코어)은 SleepStats에서, 잠든 시간/수면 효율은 아직 API에
// 없는 필드라 SLEEP_EXTRA_STATS_MOCK에서 가져온다.
function buildStatItems(stats: SleepStats) {
  return [
    { key: 'total', label: '총 수면', value: formatDuration(stats.totalSleepMinutes) },
    { key: 'latency', label: '잠든 시간', value: `${SLEEP_EXTRA_STATS_MOCK.latencyMinutes}분` },
    { key: 'wakeCount', label: '야간 각성', value: `${stats.awakeCount}회` },
    { key: 'efficiency', label: '수면 효율', value: `${SLEEP_EXTRA_STATS_MOCK.efficiencyPercent}%` },
    { key: 'core', label: '얕은 수면', value: formatDuration(stats.coreSleepMinutes) },
    { key: 'wakeMinutes', label: '각성 시간', value: formatDuration(stats.awakeMinutes) },
  ];
}

// 오늘의 피부 예보 — GET /api/v1/skin/forecast 실연동. 이 API가 실제로 내려주는 지표는
// darkCircle/complexion/barrier 3개뿐이라(눈 부기는 API에 없음) Figma의 4개 중 "눈 부기"를 뺐다.
// 3번째 지표가 빠지면서 남는 세로 공간은 아래 수면 카드 범례를 2열 x 3행으로 넓혀 쓰는 데 썼다.
// 트랙(node 350:751 등)은 배경 트랙 위에 score%만큼 진한 막대가 채워지는 형태다.
// (수면 구간 상세는 HealthKit 연동 전까지 계속 목업 — API_SPEC.md 6개 중 sleep/sessions·
// interpretation은 이 화면 범위 밖.)
const UNAVAILABLE_METRIC_COLOR = '#9E9E9E';

const SKIN_METRIC_LABELS = {
  darkCircle: '다크서클',
  complexion: '혈색 저하',
  barrier: '장벽 저하',
} as const;

type ForecastState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string }
  | { status: 'available'; forecast: SkinForecastDetail };

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

function buildSkinMetricRows(forecast: SkinForecastDetail) {
  const entries: [key: keyof typeof SKIN_METRIC_LABELS, metric: SkinForecastDetail['darkCircle'] | null][] = [
    ['darkCircle', forecast.darkCircle],
    ['complexion', forecast.complexion],
    ['barrier', forecast.barrier],
  ];
  return entries.map(([key, metric]) => ({
    key,
    label: SKIN_METRIC_LABELS[key],
    score: metric?.score ?? 0,
    grade: metric?.grade ?? '측정 불가',
    color: metric ? gradeToColor(metric.grade) : UNAVAILABLE_METRIC_COLOR,
  }));
}

function SleepTimelineBar({ segments }: { segments: SleepTimelineSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0);

  return (
    <View style={styles.timelineBarWrap}>
      <View style={styles.timelineBar}>
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={[
              styles.timelineSegment,
              { flex: segment.minutes / total, backgroundColor: STAGE_COLORS[segment.stage] },
            ]}
          />
        ))}
      </View>
      {/* 각성(node 350:786/787) 발생 시점 마커 — 바 위 절대 좌표(x159/x253, 바 기준 36.3%/64.3%)를
          비율로 환산해 얹었다. "각성 2회" 범례와 개수가 일치한다. */}
      {AROUSAL_MARKER_POSITIONS.map((leftPercent, index) => (
        <View key={index} style={[styles.arousalMarker, { left: `${leftPercent}%` }]} />
      ))}
    </View>
  );
}

function SkinMetricRow({
  label,
  score,
  grade,
  color,
}: {
  label: string;
  score: number;
  grade: string;
  color: string;
}) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <ThemedText style={styles.metricLabel}>{label}</ThemedText>
        <ThemedText style={styles.metricValue}>
          {score} <ThemedText style={[styles.metricDelta, { color }]}>{grade}</ThemedText>
        </ThemedText>
      </View>
      <View style={styles.metricTrack}>
        <View style={[styles.metricFill, { width: `${Math.min(100, score)}%` }]} />
      </View>
    </View>
  );
}

export function DailyReport() {
  const [forecastState, setForecastState] = useState<ForecastState>({ status: 'loading' });
  // 목업 트리거(위 SLEEP_SCORE_MOCK 주석 참고) — 오늘 점수가 어제보다 높을 때만 한 번 띄운다.
  const [showScoreUpModal, setShowScoreUpModal] = useState(SLEEP_SCORE_MOCK.today > SLEEP_SCORE_MOCK.previous);

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
  }, []);

  return (
    <View style={styles.container}>
      {showScoreUpModal && (
        <SleepScoreGamificationModal
          score={SLEEP_SCORE_MOCK.today}
          expGained={SLEEP_SCORE_EXP_MOCK}
          dateLabel={SLEEP_SCORE_DATE_LABEL_MOCK}
          onClose={() => setShowScoreUpModal(false)}
        />
      )}

      <ThemedText style={styles.dateRange}>{DATE_RANGE_LABEL}</ThemedText>
      <ThemedText style={styles.heading}>{USER_HEADING}</ThemedText>

      <View style={styles.sleepCard}>
        <View style={styles.sleepCardTitleRow}>
          <Image
            source={require('@/assets/images/figma-icon-report-crescent-moon.png')}
            style={styles.moonIcon}
            contentFit="contain"
          />
          <ThemedText style={styles.sleepCardTitle}>지난밤 수면 구간</ThemedText>
        </View>
        <ThemedText style={styles.sleepWindow}>
          {formatTimeKST(SLEEP_STATS_MOCK.sleepOnsetTime)} – {formatTimeKST(SLEEP_STATS_MOCK.wakeTime)}
        </ThemedText>

        <SleepTimelineBar segments={buildTimelineSegments(SLEEP_STATS_MOCK)} />

        <View style={styles.legendList}>
          {buildLegendRows(SLEEP_STATS_MOCK).map((row, rowIndex) => (
            <View key={rowIndex} style={styles.legendRow}>
              {row.map((item) => (
                <View key={item.key} style={styles.legendItem}>
                  {item.icon === 'ring' ? (
                    <View style={[styles.legendRing, { borderColor: item.color }]} />
                  ) : (
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  )}
                  <ThemedText
                    style={[styles.legendText, { color: item.color }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.5}>
                    {item.label}
                  </ThemedText>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.statGrid}>
        {buildStatItems(SLEEP_STATS_MOCK).map((item) => (
          <View key={item.key} style={styles.statCard}>
            <ThemedText style={styles.statLabel}>{item.label}</ThemedText>
            <ThemedText style={styles.statValue}>{item.value}</ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.forecastSection}>
        <ThemedText style={styles.forecastTitle}>오늘의 피부 예보</ThemedText>
        <View style={styles.metricList}>
          {forecastState.status === 'loading' && (
            <ThemedText style={styles.forecastStatusText}>불러오는 중...</ThemedText>
          )}
          {forecastState.status === 'error' && (
            <ThemedText style={styles.forecastStatusText}>피부 예보를 불러오지 못했어요</ThemedText>
          )}
          {forecastState.status === 'no_data' && (
            <ThemedText style={styles.forecastStatusText}>{forecastState.message}</ThemedText>
          )}
          {forecastState.status === 'available' &&
            buildSkinMetricRows(forecastState.forecast).map((row) => (
              <SkinMetricRow key={row.key} label={row.label} score={row.score} grade={row.grade} color={row.color} />
            ))}
        </View>
      </View>
    </View>
  );
}

// ThemedText는 type을 안 주면 기본 lineHeight:24를 깔고 들어가므로, 아래 텍스트 스타일은 실제
// 줄 수만큼 높이가 쌓이도록 전부 fontSize에 맞는 lineHeight를 명시했다(안 그러면 각 텍스트가
// 실제 필요한 높이보다 커져서 스크롤 영역 전체가 불필요하게 늘어난다).
const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },

  // "최근 7일 · 7/25 – 7/31" (node 350:789)
  dateRange: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // "test1님의 어제" (node 350:788, y128 — dateRange 하단(y97+20=117) 대비 11) — Figma가 준
  // lineHeight(20)는 fontSize(24)보다 작아 그대로 쓰면 글자가 잘려서, 잘리지 않는 값으로만 보정했다.
  heading: {
    marginTop: 11,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // "지난밤 수면 구간" 카드 (node 350:700, w362 h187, radius16, border Pale Sky 22%, y169 —
  // heading 하단(y128+20=148) 대비 21)
  sleepCard: {
    marginTop: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(112, 115, 124, 0.22)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
  },
  sleepCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moonIcon: {
    width: 19,
    height: 21,
  },
  // node 350:702 — Inter SemiBold 18
  sleepCardTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: '#031949',
  },
  // "23:40 – 07:10" (node 350:704) — Inter Bold 11.3, Tuna 69%
  sleepWindow: {
    marginTop: 10,
    fontSize: 11.3,
    lineHeight: 14,
    fontWeight: '700',
    color: 'rgba(55, 56, 60, 0.69)',
  },
  // "stages" 바 (node 350:705, h38, radius6.44, bg #F4F4F4)
  timelineBarWrap: {
    marginTop: 26,
    position: 'relative',
  },
  timelineBar: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 6.44,
    overflow: 'hidden',
    backgroundColor: '#F4F4F4',
  },
  timelineSegment: {
    height: '100%',
  },
  // 각성 마커 (node 350:786/787) — 바 위 5x5 흰 배경 + 빨간 스트로크 원.
  arousalMarker: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 4,
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E52222',
    backgroundColor: '#FFFFFF',
  },

  legendList: {
    marginTop: 14,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // 점 표시 (node 350:717 등, 8x8 radius2)
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  // "각성" 항목 전용 링 아이콘 (node 350:735, 흰 배경 + 빨간 스트로크)
  legendRing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  // node 350:719 등 — Inter Medium 12
  legendText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    flexShrink: 1,
  },

  // 지표 카드 6개 (node 350:737~814) — 3열, 배경 투명(fill alpha 0) + 테두리만 있는 카드.
  // sleepCard 하단(y169+187=356) 대비 15, 카드 행간(y457-371=86, 카드 자체 높이≈70) 대비 16.
  statGrid: {
    marginTop: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 16,
  },
  statCard: {
    flexBasis: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(107, 107, 107, 0.21)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  // node style_b5aa5bfb — Inter SemiBold 15, Tuna 61%
  statLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // node "Inter/Bold" 계열 — Cod Gray, ~16
  statValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: '#171717',
  },

  // "오늘의 피부 예보" (node 350:742/743, title fontSize20) — statGrid 하단(y457+카드높이≈529)
  // 대비 24.
  forecastSection: {
    marginTop: 24,
  },
  forecastTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#171717',
  },
  forecastStatusText: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // node 350:744 자체 paddingTop(5.78) — 제목 하단 여백(2) 포함해 8.
  metricList: {
    marginTop: 8,
    gap: 14,
  },
  metricRow: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // node style_1c6a76d0 — Inter Bold ~13.5, Cod Gray
  metricLabel: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '700',
    color: '#171717',
  },
  // node "Inter/Bold" ~12, Cod Gray + 델타 색상(초록/빨강)은 metricDelta에서 덮어씀
  metricValue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#171717',
  },
  metricDelta: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 트랙 (node 350:751 등, h5.78→6, radius2.89→3, Pale Sky 8%) + value%만큼 채워지는 진한 막대.
  metricTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(112, 115, 124, 0.08)',
  },
  metricFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#031949',
  },
});
