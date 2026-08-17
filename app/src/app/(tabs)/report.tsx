import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserMe } from '@/api/user';
import { DailyReport } from '@/components/report/daily-report';
import { MonthlyReport } from '@/components/report/monthly-report';
import { OverallReport } from '@/components/report/overall-report';
import { type Period, PeriodTabs } from '@/components/report/report-ui';
import { WeeklyReport } from '@/components/report/weekly-report';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

// REPORT 탭(REP-01~11) — 일간·주간·월간·종합 리포트.
// 일간 화면은 Figma node 350:698 실사 기준으로 배경이 옅은 파랑(#DFEAFF, HOME/TODO와 동일)이라
// 테마 배경(흰색) 대신 고정 배경을 쓴다. 네 섹션 모두 실 API로 연동됐다(각 컴포넌트 상단 주석 참고).
//
// "OOO님의 어제/일주일/한달" 헤딩의 닉네임 — 세 하위 화면이 각자 GET /api/v1/users/me를 중복
// 호출하지 않도록 여기 부모에서 한 번만 불러 nickname prop으로 내려준다(홈/마이 탭과 같은 API,
// MY-01). 로딩/에러 중엔 null을 넘겨 각 화면이 "나의 OO" 같은 안전한 기본 문구로 대체한다.
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReportScreen() {
  const [period, setPeriod] = useState<Period>('daily');
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    getUserMe(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => setNickname(data.nickname))
      .catch((error) => {
        console.error('❌ 닉네임 조회 실패:', error);
      });
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.tabsWrap}>
          <PeriodTabs selected={period} onSelect={setPeriod} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {period === 'daily' && <DailyReport nickname={nickname} />}
          {period === 'weekly' && <WeeklyReport nickname={nickname} />}
          {period === 'monthly' && <MonthlyReport nickname={nickname} />}
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
    // Figma 원본은 세그먼트 탭이 안전영역 상단에서 y40만큼 떨어져 있었지만, 일간/주간/월간
    // 리포트 콘텐츠가 스크롤 없이 최대한 한 화면에 들어오도록 탭 주변 여백만 줄였다(콘텐츠
    // 자체 디자인은 손대지 않음).
    paddingTop: Spacing.three,
  },
  // node 350:777(탭) → node 350:789("최근 7일...") 간격 — 위 paddingTop과 같은 이유로 축소.
  tabsWrap: {
    paddingBottom: Spacing.three,
  },
  scrollContent: {
    // overall-report.tsx가 CTA 버튼을 화면 하단에 고정하려면(Figma의 flex spacer) 콘텐츠 컨테이너가
    // 최소 화면 높이만큼 늘어나야 한다. 콘텐츠가 더 길면 원래대로 스크롤되니 다른 탭엔 영향 없다.
    flexGrow: 1,
    paddingBottom: BottomTabInset + Spacing.four,
  },
});
