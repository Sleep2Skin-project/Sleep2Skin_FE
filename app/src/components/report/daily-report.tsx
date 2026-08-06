import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { GaugeRow, InsightBanner, SectionCard, SectionTitle, StatGrid, type StatItem } from './report-ui';

// 일간 리포트 (REP-02~05). 실제 API가 없어 목업 값을 사용하며,
// docs/3 REPORT.csv REP-03 예시(깊은 2h6m·렘 1h11m·얕은 3h55m·각성 2회)를 그대로 따른다.
const DATE_RANGE_LABEL = '최근 7일 · 7/25 - 7/31';
const USER_HEADING = 'test1님의 어제';
const DAILY_INSIGHT = '오늘 수면 점수 79 (어제 대비 +7)';

const SLEEP_WINDOW_LABEL = '23:40 - 07:10';

// 색상은 sleep-detail-modal.tsx의 HealthKit 4단계 팔레트(Awake/REM/Core/Deep)를 그대로 재사용해
// 앱 전역에서 같은 수면 단계는 같은 색으로 보이게 한다.
const STAGE_COLORS = {
  deep: '#1C3F94',
  rem: '#9DC3FB',
  light: '#3C87F7',
  awake: '#E5E5EA',
} as const;

// 타임라인 세그먼트 합(450분)이 23:40~07:10(7시간 30분)과 일치하고,
// deep+rem+light 합(432분=7h12m)이 아래 '총 수면' 통계와도 일치하도록 구성했다.
const SLEEP_SEGMENTS: { key: string; stage: keyof typeof STAGE_COLORS; minutes: number }[] = [
  { key: '1', stage: 'light', minutes: 40 },
  { key: '2', stage: 'deep', minutes: 66 },
  { key: '3', stage: 'awake', minutes: 9 },
  { key: '4', stage: 'rem', minutes: 35 },
  { key: '5', stage: 'light', minutes: 90 },
  { key: '6', stage: 'deep', minutes: 60 },
  { key: '7', stage: 'awake', minutes: 9 },
  { key: '8', stage: 'rem', minutes: 36 },
  { key: '9', stage: 'light', minutes: 105 },
];

const LEGEND_ITEMS = [
  { key: 'deep', color: STAGE_COLORS.deep, label: '깊은 수면', value: '2시간 6분' },
  { key: 'rem', color: STAGE_COLORS.rem, label: '렘 수면', value: '1시간 11분' },
  { key: 'light', color: STAGE_COLORS.light, label: '얕은 수면', value: '3시간 55분' },
  { key: 'awake', color: STAGE_COLORS.awake, label: '각성', value: '2회' },
];

// REP-04: 총 수면 시간·깊은 수면 시간·각성 횟수·각성 총 시간·수면 효율·입면 지연 시간
const STAT_ITEMS: StatItem[] = [
  { key: 'total', label: '총 수면', value: '7시간 12분' },
  { key: 'deep', label: '깊은 수면', value: '2시간 6분' },
  { key: 'wakeCount', label: '야간 각성', value: '2회' },
  { key: 'efficiency', label: '수면 효율', value: '70%' },
  { key: 'wakeMinutes', label: '각성 시간', value: '18분' },
  { key: 'latency', label: '입면 지연', value: '62분' },
];

// REP-05: 다크서클·눈 부기·혈색 저하·장벽 4개 지표로 픽스(기능명세서 비고 확정안)
const SKIN_METRICS = [
  { key: 'darkCircle', label: '다크서클', value: 44, delta: 1 },
  { key: 'puffiness', label: '눈 부기', value: 61, delta: -3 },
  { key: 'redness', label: '혈색 저하', value: 63, delta: 7 },
  { key: 'barrier', label: '장벽', value: 79, delta: 7 },
] as const;

function SleepTimelineBar() {
  const total = SLEEP_SEGMENTS.reduce((sum, segment) => sum + segment.minutes, 0);

  return (
    <View style={styles.timelineBar}>
      {SLEEP_SEGMENTS.map((segment) => (
        <View
          key={segment.key}
          style={[
            styles.timelineSegment,
            { flex: segment.minutes / total, backgroundColor: STAGE_COLORS[segment.stage] },
          ]}
        />
      ))}
    </View>
  );
}

export function DailyReport() {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {DATE_RANGE_LABEL}
      </ThemedText>
      <ThemedText style={styles.heading}>{USER_HEADING}</ThemedText>

      <InsightBanner text={DAILY_INSIGHT} />

      <SectionCard>
        <SectionTitle>지난밤 수면 구간</SectionTitle>
        <ThemedText type="small" themeColor="textSecondary">
          {SLEEP_WINDOW_LABEL}
        </ThemedText>

        <SleepTimelineBar />

        <View style={styles.legendGrid}>
          {LEGEND_ITEMS.map((item) => (
            <View key={item.key} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <ThemedText type="small" style={styles.legendText}>
                {item.label} {item.value}
              </ThemedText>
            </View>
          ))}
        </View>
      </SectionCard>

      <StatGrid items={STAT_ITEMS} />

      <View style={styles.forecastSection}>
        <SectionTitle>오늘의 피부 예보</SectionTitle>
        {SKIN_METRICS.map((metric) => (
          <GaugeRow key={metric.key} label={metric.label} value={metric.value} delta={metric.delta} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  heading: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
  },

  timelineBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  timelineSegment: {
    height: '100%',
  },

  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.two,
  },
  legendItem: {
    flexBasis: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontWeight: '600',
  },

  forecastSection: {
    gap: Spacing.two,
  },
});
