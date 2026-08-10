import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

// 월간 리포트 (REP-08) — Figma 'Ui' 파일(9c7nKnuMLNcGYC33lmX8Im) node 306:2699("리포트- 월간")을
// Dev Mode 값 그대로 옮긴 것. 탭 전환/하단 탭바는 report.tsx/report-ui.tsx/app-tabs.tsx가 소유하는
// 공용 UI라 이 파일에서는 건드리지 않는다(daily/weekly-report.tsx와 동일 원칙 — report-ui.tsx는
// overall-report.tsx가 계속 쓰므로 그대로 둔다).
// 고정 캔버스 절대좌표 대신 Figma 좌표 간격을 padding/gap/marginTop으로 환산해 Flexbox로 짜서
// 기기 폭에 반응형으로 채운다 — 해커톤 기간상 30일치 실데이터 확보가 어려워 목업 데이터로 대체한다
// (비고란 합의사항). ThemedText는 type 생략 시 기본 lineHeight:24가 깔리므로 모든 텍스트에
// fontSize에 맞는 lineHeight를 명시했다(daily-report.tsx에서 겪은 함정과 동일).
//
// 월간 집계를 내려주는 백엔드 API는 아직 없다. 나중에 생겼을 때 바로 끼워 넣기 쉽도록, 흩어져
// 있던 목업 값들을 weekly-report.tsx와 같은 방식으로 응답 하나로 묶었다 — 실제 fetch가 생기면
// `const [data, setData] = useState(MONTHLY_REPORT_MOCK)` 후 API 응답으로 setData만 하면 된다.
export type MonthlyChartDatum = { key: string; label: string; value: number; highlighted?: boolean };
export type FactorStrength = '매우 강함' | '강함' | '보통' | '약함';
export type MonthlyFactor = { key: string; factor: string; target: string; strength: FactorStrength };
export type MonthlyStat = { key: string; label: string; value: string };

export interface MonthlyReportData {
  dateRangeLabel: string;
  heading: string;
  insight: { highWeekScore: number; lowWeekScore: number };
  chart: {
    title: string;
    legend: string;
    subRangeLabel: string;
    weeks: MonthlyChartDatum[];
    maxValue: number;
  };
  summaryStats: MonthlyStat[];
  factorSectionTitle: string;
  factors: MonthlyFactor[];
}

const MONTHLY_REPORT_MOCK: MonthlyReportData = {
  dateRangeLabel: '7월 · 7/1 - 7/31',
  heading: 'test1님의 한달',
  insight: { highWeekScore: 70, lowWeekScore: 50 },
  chart: {
    title: '월간 수면 구간',
    legend: '막대 = 달 평균 · 진한 막대 = 최고 달',
    subRangeLabel: '26.07.01 - 26.07.31',
    weeks: [
      { key: 'W1', label: 'W1', value: 55 },
      { key: 'W2', label: 'W2', value: 60 },
      { key: 'W3', label: 'W3', value: 65 },
      { key: 'W4', label: 'W4', value: 70, highlighted: true },
      { key: 'W5', label: 'W5', value: 62 },
    ],
    maxValue: 100,
  },
  summaryStats: [
    { key: 'avgScore', label: '평균 수면 점수', value: '70점' },
    { key: 'avgDeep', label: '평균 깊은수면', value: '56분' },
  ],
  factorSectionTitle: '한 달간 영향이 컸던 요인',
  factors: [
    { key: '1', factor: '취침 규칙성', target: '장벽', strength: '매우 강함' },
    { key: '2', factor: '야간 각성', target: '다크서클', strength: '강함' },
    { key: '3', factor: '깊은 수면', target: '장벽', strength: '보통' },
    { key: '4', factor: '총 수면시간', target: '유분', strength: '약함' },
  ],
};

// Figma 차트 플롯 영역 높이(막대 바닥 y202 - 가장 높은 막대 상단 y72 = 130) — 데이터가 아니라 이
// 화면 전용 레이아웃 수치라 응답 객체가 아닌 스타일 상수로 둔다.
const CHART_PLOT_HEIGHT = 130;
// "진한 막대 = 최고 달" — Figma가 막대 높이(=값) 순위에 따라 옅은 회청색→짙은 남색으로 그라데이션을
// 줬다(node 348:1079~1083). 절대색 대신 데이터 내 최소/최대 값 기준 비율로 보간한다.
const CHART_BAR_COLOR_LOW = '#D6DAE3';
const CHART_BAR_COLOR_HIGH = '#031949';

// Figma 텍스트 색(node 306:2829/2837/345 등) 그대로 — weekly-report.tsx와 같은 팔레트지만
// report-ui.tsx의 공용 STRENGTH_META는 건드리지 않고 이 파일에 로컬로 따로 둔다. 강도별 스타일
// 규칙이라 응답 데이터가 아니라 화면 상수로 둔다.
const STRENGTH_META: Record<FactorStrength, { color: string; widthPercent: number }> = {
  '매우 강함': { color: '#FF4242', widthPercent: 92 },
  강함: { color: '#FF9200', widthPercent: 68 },
  보통: { color: '#40A33C', widthPercent: 42 },
  약함: { color: 'rgba(55, 56, 60, 0.61)', widthPercent: 20 },
};

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function interpolateColor(from: string, to: string, ratio: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const clamped = Math.max(0, Math.min(1, ratio));
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

function MonthlyBarChart({ weeks, maxValue }: { weeks: MonthlyChartDatum[]; maxValue: number }) {
  const values = weeks.map((week) => week.value);
  const minRankValue = Math.min(...values);
  const maxRankValue = Math.max(...values);

  return (
    <View>
      <View style={styles.chartPlot}>
        <View style={styles.barsRow}>
          {weeks.map((week) => {
            const ratio =
              maxRankValue === minRankValue ? 1 : (week.value - minRankValue) / (maxRankValue - minRankValue);
            return (
              <View key={week.key} style={styles.barColumn}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(4, (week.value / maxValue) * CHART_PLOT_HEIGHT),
                      backgroundColor: interpolateColor(CHART_BAR_COLOR_LOW, CHART_BAR_COLOR_HIGH, ratio),
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.weekLabelsRow}>
        {weeks.map((week) => (
          <View key={week.key} style={styles.weekLabelColumn}>
            <ThemedText style={[styles.weekLabel, week.highlighted && styles.weekLabelHighlighted]}>
              {week.label}
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

export function MonthlyReport() {
  // 실제 백엔드 응답이 생기면 이 줄만 useState + useEffect(fetch)로 바꾸면 된다 — 아래 JSX는
  // 전부 data 하나만 읽으므로 그대로 동작한다.
  const data = MONTHLY_REPORT_MOCK;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.dateRange}>{data.dateRangeLabel}</ThemedText>
      <ThemedText style={styles.heading}>{data.heading}</ThemedText>

      <View style={styles.insightRow}>
        <ThemedText style={styles.insightLabel}>{'• 가장 높은 주 점수 '}</ThemedText>
        <ThemedText style={styles.insightValue}>{data.insight.highWeekScore}</ThemedText>
        <ThemedText style={styles.insightLabel}>{', 낮은 주 점수 '}</ThemedText>
        <ThemedText style={styles.insightValue}>{data.insight.lowWeekScore}</ThemedText>
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
          <ThemedText style={styles.chartLegend} numberOfLines={1}>
            {data.chart.legend}
          </ThemedText>
        </View>
        <ThemedText style={styles.chartSubRange}>{data.chart.subRangeLabel}</ThemedText>

        <MonthlyBarChart weeks={data.chart.weeks} maxValue={data.chart.maxValue} />
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

  // "최근 한달 · 7/1– 7/31" (node 306:2702)
  dateRange: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // "test1님의 한달" (node 306:2701, y127 — dateRange 하단(y97+20=117) 대비 10)
  heading: {
    marginTop: 10,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // "• 가장 높은 주 점수 70, 낮은 주 점수 50" (node 306:2741) — 배너 박스 없이 빨간 텍스트만,
  // 숫자 2개만 더 크게.
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
  insightValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#E52222',
  },

  // "월간 수면 구간" 카드 (node 348:1035, w364 h253, radius24, border #CDCDCD) — insight 하단 대비 16.
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
  // node 348:1037 — Pretendard Bold 20, 남색
  chartTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#031949',
  },
  // "막대 = 달 평균 · 진한 막대 = 최고 달" (node 348:1038) — weekly보다 글자 수가 많아 Figma
  // 원본 크기(10.5)로는 좁은 화면에서 두 줄로 밀린다. 폰트를 줄여 한 줄로 유지한다.
  chartLegend: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'right',
  },
  // "26.07.01 - 26.07.31" (node 348:1039)
  chartSubRange: {
    marginTop: 6,
    fontSize: 13.4,
    lineHeight: 16,
    fontWeight: '500',
    color: '#909090',
  },

  // 막대 플롯 영역 — 막대는 바닥 정렬.
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
  // 막대 (node 348:1079 등, radius4.77 — 4모서리 모두 동일)
  bar: {
    width: '75%',
    borderRadius: 5,
  },

  weekLabelsRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  weekLabelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // node 306:2814~2818 — Noto Sans KR Medium 13, 회색
  weekLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    color: '#9E9E9E',
  },
  // "W4"(하이라이트, node 306:2817)만 Bold + 진한 색
  weekLabelHighlighted: {
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // 지표 카드 2개 (node 306:2742/2747, w176 h84, radius14) — chartCard 하단 대비 11.
  statGrid: {
    marginTop: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(146, 139, 139, 0.21)',
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

  // "한 달간 영향이 컸던 요인" (node 306:2822) — statGrid 하단 대비 12.
  factorSection: {
    marginTop: 12,
  },
  factorSectionTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#171717',
  },
  // node 306:2823 자체 gap(14) — 제목 하단 여백 포함해 14.
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
  // node Inter/Bold — 14, Cod Gray
  factorLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#171717',
  },
  // node Inter/Bold (108:1572) — 12, 강도별 색은 STRENGTH_META에서 덮어씀
  factorStrength: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 트랙 (node EL-e8a8202d, h6, radius3, Pale Sky 8%) + widthPercent만큼 채워지는 막대.
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
