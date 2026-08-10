import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';

// 종합 리포트 (REP-09~11) — Figma 'Ui' 파일(9c7nKnuMLNcGYC33lmX8Im) node 306:2856("리포트- 종합")을
// Dev Mode 값 그대로 옮긴 것. 탭 전환/하단 탭바/배경색은 report.tsx/report-ui.tsx/app-tabs.tsx가
// 소유하는 공용 UI라 이 파일에서는 건드리지 않는다(daily/weekly/monthly-report.tsx와 동일 원칙).
// 이 프레임은 다른 리포트 탭과 달리 진짜 Auto Layout(padding/gap 값이 명시돼 있음)이라, 좌표를
// 역산할 필요 없이 그 padding/gap 값을 거의 그대로 옮겼다. ThemedText는 type 생략 시 기본
// lineHeight:24가 깔리므로 모든 텍스트에 fontSize에 맞는 lineHeight를 명시했다.
//
// 이 화면(트리아지 판단·근거·CTA)을 내려주는 백엔드 API는 아직 없다. 나중에 생겼을 때 바로 끼워
// 넣기 쉽도록, daily/weekly/monthly-report.tsx와 같은 방식으로 흩어져 있던 목업 값들을 응답 하나로
// 묶었다 — 실제 fetch가 생기면 `const [data, setData] = useState(OVERALL_REPORT_MOCK)` 후 API
// 응답으로 setData만 하면 된다.
export interface TriageReason {
  key: string;
  title: string;
  detail: string;
  /** false면 판단 근거 카드의 점이 채워진 검정 대신 빈 회색 점으로 그려진다(node 306:2971). */
  achieved: boolean;
}

export interface OverallReportData {
  observationPill: string;
  triageHeading: string;
  triageSubtext: string;
  reasons: TriageReason[];
  paragraph: string;
  appScopeItems: string[];
  clinicScopeItems: string[];
  ctaLabel: string;
  clinicUrl: string;
  disclaimer: string;
}

const OVERALL_REPORT_MOCK: OverallReportData = {
  observationPill: '3주 관찰 결과',
  triageHeading: '수면으로는 잡히지 않는 신호가 있어요',
  triageSubtext: '생활 습관이 아니라 다른 접근이 필요한 영역일 수 있습니다.',
  reasons: [
    { key: 'goal', title: '최근 3주 수면 목표', detail: '평균 깊은수면 68분 · 달성', achieved: true },
    { key: 'barrier', title: '장벽 · 다크서클', detail: '48 → 79로 뚜렷하게 회복', achieved: true },
    { key: 'pigment', title: '볼 부위 색소침착', detail: '61 → 60, 3주째 변화 없음', achieved: false },
  ],
  paragraph:
    '수면 지표는 최적인데 특정 문제만 정체되어 있습니다. 이 조합은 생활 개선으로 닿기 어려운 일상 영역의 신호입니다.',
  // REP-10: Sleep2Skin이 다루는 영역 / 클리닉이 필요한 영역
  appScopeItems: ['피부 장벽 · 푸석함', '다크서클', '일시적 염증'],
  clinicScopeItems: ['색소침착', '여드름 흉터', '구조적 노화'],
  ctaLabel: '엠레드 클리닉 상담 알아보기',
  clinicUrl: 'https://amredclinic.com/ko',
  disclaimer: '의료 진단이 아닙니다. 기록 패턴에 기반한 참고 신호입니다.',
};

function ScopeCard({ title, items, tone }: { title: string; items: string[]; tone: 'app' | 'clinic' }) {
  return (
    <View style={[styles.scopeCard, tone === 'clinic' && styles.scopeCardClinic]}>
      <ThemedText style={styles.scopeTitle}>{title}</ThemedText>
      <View style={styles.scopeList}>
        {items.map((item) => (
          <ThemedText key={item} style={styles.scopeItem}>
            · {item}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

export function OverallReport() {
  // 실제 백엔드 응답이 생기면 이 줄만 useState + useEffect(fetch)로 바꾸면 된다 — 아래 JSX는
  // 전부 data 하나만 읽으므로 그대로 동작한다.
  const data = OVERALL_REPORT_MOCK;

  const handleCtaPress = () => {
    // REP-11: 엠레드 클리닉 상담 페이지로 이동. Linking.openURL은 웹에서는 새 탭으로,
    // 네이티브에서는 외부 브라우저/앱으로 열어 플랫폼별 분기 없이 동작한다.
    Linking.openURL(data.clinicUrl).catch((error) => {
      console.warn('Failed to open clinic link', error);
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.pill}>
          <ThemedText style={styles.pillText}>{data.observationPill}</ThemedText>
        </View>
        <ThemedText style={styles.heroHeading}>{data.triageHeading}</ThemedText>
        <ThemedText style={styles.heroSubtext}>{data.triageSubtext}</ThemedText>
      </View>

      <View style={styles.reasonCard}>
        <ThemedText style={styles.reasonCardTitle}>이렇게 판단했어요</ThemedText>
        {data.reasons.map((reason) => (
          <View key={reason.key} style={styles.reasonRow}>
            <View style={[styles.reasonDot, !reason.achieved && styles.reasonDotUnachieved]} />
            <View style={styles.reasonTextBlock}>
              <ThemedText style={styles.reasonTitle}>{reason.title}</ThemedText>
              <ThemedText style={styles.reasonDetail}>{reason.detail}</ThemedText>
            </View>
          </View>
        ))}
        <ThemedText style={styles.reasonParagraph}>{data.paragraph}</ThemedText>
      </View>

      <View style={styles.scopeRow}>
        <ScopeCard title="Sleep2Skin이 돕는 것" items={data.appScopeItems} tone="app" />
        <ScopeCard title="클리닉이 필요한 것" items={data.clinicScopeItems} tone="clinic" />
      </View>

      {/* node 306:2987 "spacer" — 카드가 화면보다 짧을 때 CTA를 화면 하단에 붙인다. 카드가 길어
          스크롤이 필요해지면 flex:1이 0으로 수렴해 자연스럽게 원래 흐름대로 쌓인다. */}
      <View style={styles.spacer} />

      <Pressable onPress={handleCtaPress} style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}>
        <ThemedText style={styles.ctaText}>{data.ctaLabel}</ThemedText>
      </Pressable>

      <ThemedText style={styles.disclaimer}>{data.disclaimer}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  // Figma "content" 프레임(padding "10px 24px", gap 12px, sizing 고정 393x671) — 좌우 24px는
  // report.tsx의 safeArea가 이미 주고 있어 여기서는 상단 10px과 섹션 간 gap 12px만 옮긴다.
  // flex:1은 report.tsx의 ScrollView(contentContainerStyle flexGrow:1)와 짝을 이뤄 화면 높이만큼
  // 늘어나게 해서, 아래 spacer가 CTA 버튼을 화면 하단에 붙일 수 있게 한다.
  container: {
    flex: 1,
    paddingTop: 10,
    gap: 12,
  },
  spacer: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },

  // "트리아지 알림" (node 306:2953, padding16, gap8, radius14, fill #031949)
  hero: {
    backgroundColor: Colors.primaryDark,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  // "3주 관찰 결과" 배지 (node 306:2954) — 반투명 배경이 아니라 테두리만 있는 알약.
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#9E9E9E',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: Colors.white,
  },
  // "수면으로는 잡히지 않는 신호가 있어요" (node 306:2956) — Pretendard SemiBold 20, lineHeight 1.4em
  heroHeading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    color: Colors.white,
  },
  // node 306:2957 — fontSize12, lineHeight 1.55em, opacity 0.75
  heroSubtext: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.75)',
  },

  // "판단 근거" 카드 (node 306:2958, padding16, gap10, radius14, border #DCDCDC)
  reasonCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#DCDCDC',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  // "이렇게 판단했어요" (node 306:2959) — Bold 15, lineHeight 1.45em
  reasonCardTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  // 점 (node 306:2961, 16x16 원, 기본은 채워진 검정)
  reasonDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  // "변화 없음" 항목 전용(node 306:2971) — 빈 회색 원 + 테두리
  reasonDotUnachieved: {
    backgroundColor: '#DEDEDE',
    borderWidth: 1,
    borderColor: '#AFAFAF',
  },
  reasonTextBlock: {
    flex: 1,
    gap: 2,
  },
  // node style_e872cc2c — Medium 15, lineHeight 1.45em
  reasonTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  // node style_2e329da4 — Regular 11, lineHeight 1.5em
  reasonDetail: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // node 306:2975 — Regular 11, lineHeight 1.58em, #6B6B6B(판단 근거 상세보다 더 진한 회색)
  reasonParagraph: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '400',
    color: '#6B6B6B',
  },

  // "영역 구분" (node 306:2976, gap8)
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  // 카드(node 306:2977/2982, padding14, gap6, radius12)
  scopeCard: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    borderWidth: 1,
    borderColor: '#DCDCDC',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  // "클리닉이 필요한 것" — 배경이 더 짙은 회색 + 테두리 색만 다르고, 제목 색은 왼쪽 카드와 동일
  // (기존 코드는 danger 빨강을 줬는데 Figma엔 없어서 뺐다).
  scopeCardClinic: {
    backgroundColor: '#E9E9E9',
    borderColor: 'rgba(0, 0, 0, 0.29)',
  },
  // node style_ef978d32 — Bold 12, lineHeight 1.4em
  scopeTitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  scopeList: {
    gap: 2,
  },
  // node style_2e329da4 — Regular 11, lineHeight 1.5em
  scopeItem: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '400',
    color: '#6B6B6B',
  },

  // CTA 버튼(node 306:2989, height52, radius10, fill #031949)
  ctaButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // node — Medium 15
  ctaText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.white,
  },
  // node 306:2990 — Regular 10, lineHeight 1.5em, 중앙 정렬
  disclaimer: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'center',
  },
});
