import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { SectionTitle } from './report-ui';

// 종합 리포트 (REP-09~11) — 트리아지 판단, 앱/클리닉 담당 영역 구분, 클리닉 상담 CTA.
const OBSERVATION_PILL = '3주 관찰 결과';
const TRIAGE_HEADING = '수면으로는 잡히지 않는 신호가 있어요';
const TRIAGE_SUBTEXT = '생활 습관이 아니라 다른 접근이 필요한 영역일 수 있습니다.';

// REP-09 근거 3항목 예시를 그대로 사용
const TRIAGE_REASONS = [
  { key: 'goal', title: '최근 3주 수면 목표', detail: '평균 깊은수면 68분 · 달성' },
  { key: 'barrier', title: '장벽 · 다크서클', detail: '48 → 79로 뚜렷하게 회복' },
  { key: 'pigment', title: '볼 부위 색소침착', detail: '61 → 60, 3주째 변화 없음' },
];

const TRIAGE_PARAGRAPH =
  '수면 지표는 최적인데 특정 문제만 정체되어 있습니다. 이 조합은 생활 개선으로 닿기 어려운 일상 영역의 신호입니다.';

// REP-10: SkinCast가 다루는 영역 / 클리닉이 필요한 영역
const APP_SCOPE_ITEMS = ['피부 장벽·푸석함', '다크서클', '일시적 염증'];
const CLINIC_SCOPE_ITEMS = ['색소침착', '여드름 흉터', '구조적 노화'];

const CTA_LABEL = '엠레드 클리닉 상담 알아보기';
const CLINIC_URL = 'https://amredclinic.com/ko';
const DISCLAIMER = '의료 진단이 아닙니다. 기록 패턴에 기반한 참고 신호입니다.';

function ScopeCard({ title, items, tone }: { title: string; items: string[]; tone: 'app' | 'clinic' }) {
  const theme = useTheme();
  return (
    <View style={[styles.scopeCard, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={[styles.scopeTitle, tone === 'clinic' && { color: Colors.danger }]}>{title}</ThemedText>
      <View style={styles.scopeList}>
        {items.map((item) => (
          <ThemedText key={item} type="small" themeColor="textSecondary">
            · {item}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

export function OverallReport() {
  const handleCtaPress = () => {
    // REP-11: 엠레드 클리닉 상담 페이지로 이동. Linking.openURL은 웹에서는 새 탭으로,
    // 네이티브에서는 외부 브라우저/앱으로 열어 플랫폼별 분기 없이 동작한다.
    Linking.openURL(CLINIC_URL).catch((error) => {
      console.warn('Failed to open clinic link', error);
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.pill}>
          <ThemedText style={styles.pillText}>{OBSERVATION_PILL}</ThemedText>
        </View>
        <ThemedText style={styles.heroHeading}>{TRIAGE_HEADING}</ThemedText>
        <ThemedText style={styles.heroSubtext}>{TRIAGE_SUBTEXT}</ThemedText>
      </View>

      <View style={styles.reasonSection}>
        <SectionTitle>이렇게 판단했어요</SectionTitle>
        {TRIAGE_REASONS.map((reason) => (
          <View key={reason.key} style={styles.reasonRow}>
            <View style={styles.reasonDot} />
            <View style={styles.reasonTextBlock}>
              <ThemedText style={styles.reasonTitle}>{reason.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {reason.detail}
              </ThemedText>
            </View>
          </View>
        ))}
        <ThemedText type="small" themeColor="textSecondary" style={styles.reasonParagraph}>
          {TRIAGE_PARAGRAPH}
        </ThemedText>
      </View>

      <View style={styles.scopeRow}>
        <ScopeCard title="SkinCast가 돕는 것" items={APP_SCOPE_ITEMS} tone="app" />
        <ScopeCard title="클리닉이 필요한 것" items={CLINIC_SCOPE_ITEMS} tone="clinic" />
      </View>

      <Pressable onPress={handleCtaPress} style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}>
        <ThemedText style={styles.ctaText}>{CTA_LABEL}</ThemedText>
      </Pressable>

      <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
        {DISCLAIMER}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  pressed: {
    opacity: 0.7,
  },

  hero: {
    backgroundColor: Colors.primaryDark,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  pillText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  heroHeading: {
    color: Colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
  },
  heroSubtext: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 19,
  },

  reasonSection: {
    gap: Spacing.two,
  },
  reasonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  reasonDot: {
    marginTop: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primaryDark,
  },
  reasonTextBlock: {
    flex: 1,
    gap: 2,
  },
  reasonTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  reasonParagraph: {
    marginTop: Spacing.one,
    lineHeight: 19,
  },

  scopeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  scopeCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  scopeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  scopeList: {
    gap: Spacing.half,
  },

  ctaButton: {
    backgroundColor: Colors.primaryDark,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  ctaText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  disclaimer: {
    textAlign: 'center',
  },
});
