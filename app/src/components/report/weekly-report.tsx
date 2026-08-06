import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import {
  BarChart,
  type BarChartDatum,
  FactorRow,
  type FactorStrength,
  InsightBanner,
  SectionCard,
  SectionTitle,
  StatGrid,
  type StatItem,
} from './report-ui';

// 주간 리포트 (REP-06~07).
const DATE_RANGE_LABEL = '최근 7일 · 7/25 - 7/31';
const USER_HEADING = 'test1님의 일주일';
const WEEKLY_INSIGHT = '저번주 보다 수면 점수 + 10';
const CHART_LEGEND = '막대 = 장벽 · 점선 = 목표';

const CHART_DATA: BarChartDatum[] = [
  { key: '25', label: '25', value: 58 },
  { key: '26', label: '26', value: 74 },
  { key: '27', label: '27', value: 78 },
  { key: '28', label: '28', value: 70 },
  { key: '29', label: '29', value: 60 },
  { key: '30', label: '30', value: 66 },
  { key: '31', label: '31', value: 79, highlighted: true },
];
const CHART_MAX = 100;
const CHART_TARGET = 75;

const SUMMARY_STATS: StatItem[] = [
  { key: 'avgScore', label: '평균 수면 점수', value: '70점' },
  { key: 'avgDeep', label: '평균 깊은수면', value: '56분' },
];

// REP-07: 요인 → 지표 쌍 4종과 상관 강도(매우 강함/강함/보통/약함)
const FACTORS: { key: string; factor: string; target: string; strength: FactorStrength }[] = [
  { key: '1', factor: '야간 각성', target: '다크서클', strength: '매우 강함' },
  { key: '2', factor: '깊은 수면', target: '장벽', strength: '강함' },
  { key: '3', factor: '총 수면시간', target: '유분', strength: '보통' },
  { key: '4', factor: '취침 규칙성', target: '톤', strength: '약함' },
];

export function WeeklyReport() {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {DATE_RANGE_LABEL}
      </ThemedText>
      <ThemedText style={styles.heading}>{USER_HEADING}</ThemedText>

      <InsightBanner text={WEEKLY_INSIGHT} />

      <SectionCard>
        <View style={styles.chartHeader}>
          <SectionTitle>수면 점수</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {CHART_LEGEND}
          </ThemedText>
        </View>
        <BarChart data={CHART_DATA} maxValue={CHART_MAX} targetValue={CHART_TARGET} />
      </SectionCard>

      <StatGrid items={SUMMARY_STATS} />

      <View style={styles.factorSection}>
        <SectionTitle>한 주간 영향이 컸던 요인</SectionTitle>
        {FACTORS.map((item) => (
          <FactorRow key={item.key} factor={item.factor} target={item.target} strength={item.strength} />
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
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  factorSection: {
    gap: Spacing.three,
  },
});
