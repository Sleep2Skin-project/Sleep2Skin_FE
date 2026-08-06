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

// 월간 리포트 (REP-08). 해커톤 기간상 30일치 실데이터 확보가 어려워 목업 데이터로 대체한다(비고란 합의사항).
const DATE_RANGE_LABEL = '7월 · 7/1 - 7/31';
const USER_HEADING = 'test1님의 한달';
const MONTHLY_INSIGHT = '가장 높은 주 점수 70, 낮은 주 점수 50';
const CHART_LEGEND = '막대 = 주 평균 · 진한 막대 = 최고 주';

const CHART_DATA: BarChartDatum[] = [
  { key: 'W1', label: 'W1', value: 55 },
  { key: 'W2', label: 'W2', value: 60 },
  { key: 'W3', label: 'W3', value: 65 },
  { key: 'W4', label: 'W4', value: 70, highlighted: true },
  { key: 'W5', label: 'W5', value: 62 },
];
const CHART_MAX = 100;

const SUMMARY_STATS: StatItem[] = [
  { key: 'avgScore', label: '평균 수면 점수', value: '70점' },
  { key: 'avgDeep', label: '평균 깊은수면', value: '56분' },
];

const FACTORS: { key: string; factor: string; target: string; strength: FactorStrength }[] = [
  { key: '1', factor: '취침 규칙성', target: '장벽', strength: '매우 강함' },
  { key: '2', factor: '야간 각성', target: '다크서클', strength: '강함' },
  { key: '3', factor: '깊은 수면', target: '장벽', strength: '보통' },
  { key: '4', factor: '총 수면시간', target: '유분', strength: '약함' },
];

export function MonthlyReport() {
  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary">
        {DATE_RANGE_LABEL}
      </ThemedText>
      <ThemedText style={styles.heading}>{USER_HEADING}</ThemedText>

      <InsightBanner text={MONTHLY_INSIGHT} />

      <SectionCard>
        <View style={styles.chartHeader}>
          <SectionTitle>주차별 점수</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {CHART_LEGEND}
          </ThemedText>
        </View>
        <BarChart data={CHART_DATA} maxValue={CHART_MAX} />
      </SectionCard>

      <StatGrid items={SUMMARY_STATS} />

      <View style={styles.factorSection}>
        <SectionTitle>한 달간 영향이 컸던 요인</SectionTitle>
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
