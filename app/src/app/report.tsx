import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DailyReport } from '@/components/report/daily-report';
import { MonthlyReport } from '@/components/report/monthly-report';
import { OverallReport } from '@/components/report/overall-report';
import { type Period, PeriodTabs } from '@/components/report/report-ui';
import { WeeklyReport } from '@/components/report/weekly-report';
import { Colors } from '@/constants/colors';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

// REPORT 탭(REP-01~11) — 일간·주간·월간·종합 리포트.
// 일간 화면은 Figma node 350:698 실사 기준으로 배경이 옅은 파랑(#DFEAFF, HOME/TODO와 동일)이라
// 테마 배경(흰색) 대신 고정 배경을 쓴다. 주간/월간/종합 섹션은 아직 목업 데이터로 렌더링한다.
export default function ReportScreen() {
  const [period, setPeriod] = useState<Period>('daily');

  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    // Figma node 350:777(세그먼트 탭)이 안전영역 상단에서 y40만큼 떨어져 있다 — 기존 8px은 너무 붙어 있었다.
    paddingTop: 40,
  },
  // node 350:777(탭) 바닥(y40+h33.94≈74) → node 350:789("최근 7일...") 상단(y97) 간격.
  tabsWrap: {
    paddingBottom: 23,
  },
  scrollContent: {
    // overall-report.tsx가 CTA 버튼을 화면 하단에 고정하려면(Figma의 flex spacer) 콘텐츠 컨테이너가
    // 최소 화면 높이만큼 늘어나야 한다. 콘텐츠가 더 길면 원래대로 스크롤되니 다른 탭엔 영향 없다.
    flexGrow: 1,
    paddingBottom: BottomTabInset + Spacing.four,
  },
});
