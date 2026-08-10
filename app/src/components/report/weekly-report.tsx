import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

// 주간 리포트 (REP-06~07) — Figma 'Ui' 파일(9c7nKnuMLNcGYC33lmX8Im) node 306:2268("리포트- 주간")을
// Dev Mode 값 그대로 옮긴 것. 탭 전환 세그먼트(일간/주간/월간/종합)와 하단 탭바는
// report.tsx/report-ui.tsx/app-tabs.tsx가 소유하는 공용 UI라 이 파일에서는 건드리지 않는다
// (daily-report.tsx와 동일 원칙 — report-ui.tsx는 monthly/overall이 계속 쓰므로 그대로 둔다).
// 고정 캔버스 절대좌표 대신 Figma 좌표 간격을 padding/gap/marginTop으로 환산해 Flexbox로 짜서
// 기기 폭에 반응형으로 채운다. ThemedText는 type 생략 시 기본 lineHeight:24가 깔리므로 모든
// 텍스트에 fontSize에 맞는 lineHeight를 명시했다(daily-report.tsx에서 겪은 것과 같은 함정).
//
// 주간 집계(점수 추이/평균/요인 상관관계)를 내려주는 백엔드 API는 아직 없다(daily의 skin/forecast
// 같은 실제 타입이 없음). 그래도 나중에 그런 엔드포인트가 생겼을 때 이 자리에 바로 끼워 넣기
// 쉽도록, 흩어져 있던 목업 값들을 응답 하나로 묶었다 — 실제 fetch가 생기면
// `const [data, setData] = useState(WEEKLY_REPORT_MOCK)` 후 API 응답으로 setData만 하면 된다
// (스킨 예보를 API로 바꿨을 때와 동일한 패턴).
export type WeeklyChartDatum = { key: string; label: string; value: number; highlighted?: boolean };
export type FactorStrength = '매우 강함' | '강함' | '보통' | '약함';
export type WeeklyFactor = { key: string; factor: string; target: string; strength: FactorStrength };
export type WeeklyStat = { key: string; label: string; value: string };

export interface WeeklyReportData {
  dateRangeLabel: string;
  heading: string;
  /** 저번주 대비 수면 점수 변화량 — "+10"처럼 부호 붙여서 보여준다. */
  insightScoreDelta: number;
  chart: {
    title: string;
    legend: string;
    subRangeLabel: string;
    days: WeeklyChartDatum[];
    maxValue: number;
    targetScore: number;
  };
  summaryStats: WeeklyStat[];
  factorSectionTitle: string;
  factors: WeeklyFactor[];
}

const WEEKLY_REPORT_MOCK: WeeklyReportData = {
  dateRangeLabel: '최근 7일 · 7/25 - 7/31',
  heading: 'test1님의 일주일',
  insightScoreDelta: 10,
  chart: {
    title: '주간 수면 구간',
    legend: '막대= 수면/ 점선= 목표',
    subRangeLabel: '26.07.25 - 26.07.31',
    days: [
      { key: '25', label: '25', value: 58 },
      { key: '26', label: '26', value: 74 },
      { key: '27', label: '27', value: 78 },
      { key: '28', label: '28', value: 70 },
      { key: '29', label: '29', value: 60 },
      { key: '30', label: '30', value: 66 },
      { key: '31', label: '31', value: 79, highlighted: true },
    ],
    maxValue: 100,
    targetScore: 75,
  },
  summaryStats: [
    { key: 'avgScore', label: '평균 수면 점수', value: '70점' },
    { key: 'avgDeep', label: '평균 깊은수면', value: '56분' },
  ],
  factorSectionTitle: '한 주간 영향이 컸던 요인',
  factors: [
    { key: '1', factor: '야간 각성', target: '다크서클', strength: '매우 강함' },
    { key: '2', factor: '깊은 수면', target: '장벽', strength: '강함' },
    { key: '3', factor: '총 수면시간', target: '유분', strength: '보통' },
    { key: '4', factor: '취침 규칙성', target: '톤', strength: '약함' },
  ],
};

function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

// Figma 차트 플롯 영역 높이(막대 바닥 y206 - 가장 높은 막대 상단 y52 ≈ 154px) — 데이터가 아니라
// 이 화면 전용 레이아웃 수치라 응답 객체가 아닌 스타일 상수로 둔다.
const CHART_PLOT_HEIGHT = 154;
// "점선(목표)" 라인의 점 색 — Figma가 점마다 남색/검정을 번갈아 썼다(node 348:1017~1023).
// (참고: Figma 원본은 이 목표선이 요일마다 오르내리는 곡선인데, 그 세부 값은 지금 데이터에 없어
// 기존 targetScore 단일값 기준의 수평선 + 점 마커로 옮겼다.)
const TARGET_DOT_COLORS = ['#031949', '#031949', '#000000', '#000000', '#000000', '#031949', '#031949'];

// Figma 텍스트 색(node 306:2456/2464/2472/2480) 그대로 — report-ui.tsx의 공용 STRENGTH_META와는
// 다른 색이라(이 파일 전용 리팩터링이라 공용 파일은 건드리지 않음) 로컬로 따로 둔다. 강도별 스타일
// 규칙이라 응답 데이터가 아니라 화면 상수로 둔다.
const STRENGTH_META: Record<FactorStrength, { color: string; widthPercent: number }> = {
  '매우 강함': { color: '#FF4242', widthPercent: 92 },
  강함: { color: '#FF9200', widthPercent: 68 },
  보통: { color: '#40A33C', widthPercent: 42 },
  약함: { color: 'rgba(55, 56, 60, 0.61)', widthPercent: 20 },
};

function WeeklyBarChart({
  days,
  maxValue,
  targetScore,
}: {
  days: WeeklyChartDatum[];
  maxValue: number;
  targetScore: number;
}) {
  const targetHeight = (targetScore / maxValue) * CHART_PLOT_HEIGHT;

  return (
    <View>
      <View style={styles.chartPlot}>
        <View style={[styles.targetLine, { bottom: targetHeight }]} />
        <View style={styles.barsRow}>
          {days.map((day) => (
            <View key={day.key} style={styles.barColumn}>
              <View style={[styles.bar, { height: Math.max(4, (day.value / maxValue) * CHART_PLOT_HEIGHT) }]} />
            </View>
          ))}
        </View>
        <View style={[styles.targetDotsRow, { bottom: targetHeight - 3 }]}>
          {days.map((day, index) => (
            <View key={day.key} style={styles.targetDotColumn}>
              <View style={[styles.targetDot, { backgroundColor: TARGET_DOT_COLORS[index] }]} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.dayLabelsRow}>
        {days.map((day) => (
          <View key={day.key} style={styles.dayLabelColumn}>
            <ThemedText style={[styles.dayLabel, day.highlighted && styles.dayLabelHighlighted]}>
              {day.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function FactorRow({
  factor,
  target,
  strength,
}: {
  factor: string;
  target: string;
  strength: FactorStrength;
}) {
  const meta = STRENGTH_META[strength];

  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHeader}>
        <ThemedText style={styles.factorLabel}>
          {factor} → {target}
        </ThemedText>
        <ThemedText style={[styles.factorStrength, { color: meta.color }]}>{strength}</ThemedText>
      </View>
      <View style={styles.factorTrack}>
        <View style={[styles.factorFill, { width: `${meta.widthPercent}%`, backgroundColor: meta.color }]} />
      </View>
    </View>
  );
}

export function WeeklyReport() {
  // 실제 백엔드 응답이 생기면 이 줄만 useState + useEffect(fetch)로 바꾸면 된다 — 아래 JSX는
  // 전부 data 하나만 읽으므로 그대로 동작한다.
  const data = WEEKLY_REPORT_MOCK;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.dateRange}>{data.dateRangeLabel}</ThemedText>
      <ThemedText style={styles.heading}>{data.heading}</ThemedText>

      <View style={styles.insightRow}>
        <ThemedText style={styles.insightLabel}>{'• 저번주 보다 수면 점수 '}</ThemedText>
        <ThemedText style={styles.insightDelta}>{formatSigned(data.insightScoreDelta)}</ThemedText>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <View style={styles.chartTitleRow}>
            <Image
              source={require('@/assets/images/figma-icon-report-crescent-moon.png')}
              style={styles.moonIcon}
              contentFit="contain"
            />
            <ThemedText style={styles.chartTitle}>{data.chart.title}</ThemedText>
          </View>
          <ThemedText style={styles.chartLegend}>{data.chart.legend}</ThemedText>
        </View>
        <ThemedText style={styles.chartSubRange}>{data.chart.subRangeLabel}</ThemedText>

        <WeeklyBarChart days={data.chart.days} maxValue={data.chart.maxValue} targetScore={data.chart.targetScore} />
      </View>

      <View style={styles.statGrid}>
        {data.summaryStats.map((item) => (
          <View key={item.key} style={styles.statCard}>
            <ThemedText style={styles.statLabel}>{item.label}</ThemedText>
            <ThemedText style={styles.statValue}>{item.value}</ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.factorSection}>
        <ThemedText style={styles.factorSectionTitle}>{data.factorSectionTitle}</ThemedText>
        <View style={styles.factorList}>
          {data.factors.map((item) => (
            <FactorRow key={item.key} factor={item.factor} target={item.target} strength={item.strength} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },

  // "최근 7일 · 7/25 – 7/31" (node 306:2385)
  dateRange: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // "test1님의 일주일" (node 306:2384, y127 — dateRange 하단(y97+20=117) 대비 10)
  heading: {
    marginTop: 10,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // "• 저번주 보다 수면 점수 +10" (node 306:2428/348:1033) — 배너 박스 없이 빨간 텍스트만.
  insightRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  insightLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    color: '#E52222',
  },
  insightDelta: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#E52222',
  },

  // "주간 수면 구간" 카드 (node 348:935, w358 h253, radius24, border #CDCDCD) — insight 하단 대비 16.
  chartCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CDCDCD',
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 20,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  moonIcon: {
    width: 19,
    height: 21,
  },
  // node 348:936 — Pretendard Bold 20, 남색
  chartTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#031949',
  },
  // "막대= 수면/ 점선= 목표" (node 348:939)
  chartLegend: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '400',
    color: '#9C9C9C',
  },
  // "26.07.25 - 26.07.31" (node 348:940)
  chartSubRange: {
    marginTop: 6,
    fontSize: 13.4,
    lineHeight: 16,
    fontWeight: '500',
    color: '#909090',
  },

  // 막대 플롯 영역 — 막대는 바닥 정렬, 목표선/점은 절대 좌표로 얹는다.
  chartPlot: {
    marginTop: 18,
    height: CHART_PLOT_HEIGHT,
    position: 'relative',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // 막대 (node 348:993 등, fill #D1D9E9, radius6.79 — 4모서리 모두 동일하게 둥글다)
  bar: {
    width: '82%',
    borderRadius: 7,
    backgroundColor: '#D1D9E9',
  },
  // 목표선 (점선) — node 348:1024~1029 스트로크를 하나의 가로 점선으로 옮겼다.
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#031949',
  },
  targetDotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  targetDotColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // 목표선 점 (node 348:1017~1023, 3x3 원)
  targetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  dayLabelsRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  dayLabelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // node 348:1009~1014 — Noto Sans KR Medium 12, 회색
  dayLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: '#9E9E9E',
  },
  // "31"(오늘, node 348:1015)만 Bold + 진한 색
  dayLabelHighlighted: {
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // 지표 카드 2개 (node 306:2439/2444, w176 h87, radius14) — chartCard 하단 대비 12.
  statGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(107, 107, 107, 0.21)',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  // node style_b5aa5bfb — Inter SemiBold 15, Tuna 61%
  statLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // node style_22ee3cf1 — Inter Bold 22, Cod Gray
  statValue: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    color: '#171717',
  },

  // "한 주간 영향이 컸던 요인" (node 306:2449) — statGrid 하단 대비 12.
  factorSection: {
    marginTop: 12,
  },
  factorSectionTitle: {
    fontSize: 16.6,
    lineHeight: 21,
    fontWeight: '700',
    color: '#171717',
  },
  // node 306:2450 자체 gap(13.68) — 제목 하단 여백 포함해 14.
  factorList: {
    marginTop: 14,
    gap: 14,
  },
  factorRow: {
    gap: 6,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // node style_92ec3dff — Inter Bold ~13.68, Cod Gray
  factorLabel: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '700',
    color: '#171717',
  },
  // node style_6e2192a5 — Inter Bold ~11.72, 강도별 색은 STRENGTH_META에서 덮어씀
  factorStrength: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 트랙 (node 348:ea96261c 계열, h5.86→6, radius2.93→3, Pale Sky 8%) + widthPercent만큼 채워지는 막대.
  factorTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(112, 115, 124, 0.08)',
  },
  factorFill: {
    height: '100%',
    borderRadius: 3,
  },
});
