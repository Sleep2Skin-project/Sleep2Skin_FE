import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DailyReport } from '@/components/report/daily-report';
import { MonthlyReport } from '@/components/report/monthly-report';
import { OverallReport } from '@/components/report/overall-report';
import { type Period, PeriodTabs } from '@/components/report/report-ui';
import { WeeklyReport } from '@/components/report/weekly-report';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

// REPORT 탭(REP-01~11) — 일간·주간·월간·종합 리포트.
// docs/report.png 와이어프레임 구조를 그대로 따르되, 실제 API가 없어 각 섹션 컴포넌트 내부의
// 목업 데이터로 렌더링한다(docs/3 REPORT.csv 기준).
export default function ReportScreen() {
  const [period, setPeriod] = useState<Period>('daily');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.tabsWrap}>
          <PeriodTabs selected={period} onSelect={setPeriod} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {period === 'daily' && <DailyReport />}
          {period === 'weekly' && <WeeklyReport />}
          {period === 'monthly' && <MonthlyReport />}
          {period === 'overall' && <OverallReport />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  tabsWrap: {
    paddingBottom: Spacing.three,
  },
  scrollContent: {
    paddingBottom: BottomTabInset + Spacing.four,
  },
});
