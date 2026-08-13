import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateModelReliability, getSkinModel, SkinModelUserNotFoundError, type SkinModelDetail } from '@/api/skin';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TEMP_USER_ID } from '@/constants/config';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// MY 탭(MY-01~05)의 임시 자리 표시자. 최종 디자인 시안이 나오기 전까지는 기본 UI 요소(ThemedView/
// ThemedText)만으로 뼈대를 잡고, GET /api/v1/skin/model(REP-12, getSkinModel) 데이터 바인딩에
// 집중한다. 디자인이 나오면 이 파일의 스타일만 갈아끼우면 되도록 데이터 흐름과 구역(View)만
// 미리 정리해 둔 상태 — 레이아웃은 나중에 얼마든지 바뀔 수 있다.

// metric 필드(DARK_CIRCLE/BARRIER/COMPLEXION) → 표시 라벨. index.tsx/selfie-verification-flow.tsx와
// 동일한 한글 라벨을 써서 앱 전체 표기를 통일한다.
const METRIC_LABELS: Record<string, string> = {
  DARK_CIRCLE: '다크서클',
  BARRIER: '장벽',
  COMPLEXION: '안색',
};

function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

type MyModelState =
  | { status: 'loading' }
  | { status: 'user_not_found' }
  | { status: 'error' }
  | { status: 'no_verification'; message: string | null }
  | { status: 'available'; model: SkinModelDetail };

function useMyModel(): MyModelState {
  const [state, setState] = useState<MyModelState>({ status: 'loading' });

  useEffect(() => {
    getSkinModel(TEMP_USER_ID)
      .then(({ data }) => {
        setState(
          data.status === 'AVAILABLE'
            ? { status: 'available', model: data.model }
            : { status: 'no_verification', message: data.message }
        );
      })
      .catch((error) => {
        if (error instanceof SkinModelUserNotFoundError) {
          console.error(`❌ 내 모델 조회 실패: 존재하지 않는 사용자 (userId: ${error.userId})`);
          setState({ status: 'user_not_found' });
          return;
        }
        console.error('❌ 내 모델 조회 실패:', error);
        setState({ status: 'error' });
      });
  }, []);

  return state;
}

// 신뢰도 뱃지 — calculateModelReliability(count)가 매긴 등급(下/中/上)을 그대로 텍스트로 보여준다.
function ReliabilityBadge({ count }: { count: number }) {
  const theme = useTheme();
  const grade = calculateModelReliability(count);

  return (
    <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">신뢰도 {grade}</ThemedText>
    </View>
  );
}

function MetricSection({ metric }: { metric: SkinModelDetail['metrics'][number] }) {
  const theme = useTheme();

  return (
    <View style={[styles.metricCard, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold" style={styles.metricCardTitle}>
        {metricLabel(metric.metric)}
      </ThemedText>

      <View style={styles.featureList}>
        {metric.features.map((feature) => (
          <View key={feature.feature} style={styles.featureRow}>
            <ThemedText type="default" style={styles.featureLabel}>
              {feature.label}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.featureRatio}>
              일반 대비 {feature.ratio.toFixed(1)}배
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function MyModelBody() {
  const state = useMyModel();

  if (state.status === 'loading') {
    return (
      <View style={styles.centeredBody}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (state.status === 'user_not_found') {
    return (
      <View style={styles.centeredBody}>
        <ThemedText themeColor="textSecondary" style={styles.placeholderText}>
          유저 정보를 찾을 수 없어요
        </ThemedText>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centeredBody}>
        <ThemedText themeColor="textSecondary" style={styles.placeholderText}>
          내 모델 정보를 불러오지 못했어요
        </ThemedText>
      </View>
    );
  }

  if (state.status === 'no_verification') {
    return (
      <View style={styles.centeredBody}>
        <ThemedText themeColor="textSecondary" style={styles.placeholderText}>
          {state.message ?? '아직 나만의 모델이 없어요. 첫 셀피 검증을 완료해 보세요!'}
        </ThemedText>
      </View>
    );
  }

  const { model } = state;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* 헤드라인 구역 */}
      <View style={styles.headlineSection}>
        <ThemedText type="subtitle" style={styles.headlineText}>
          {model.headline}
        </ThemedText>
      </View>

      {/* 메타 정보 구역 — 누적 검증 횟수 + 신뢰도 뱃지 */}
      <View style={styles.metaSection}>
        <ThemedText themeColor="textSecondary" type="small">
          누적 검증 {model.verificationCount}회
        </ThemedText>
        <ReliabilityBadge count={model.verificationCount} />
      </View>

      {/* 가중치 리스트 구역 — metrics 배열을 지표별 카드로 순회 */}
      <View style={styles.metricsSection}>
        {model.metrics.map((metric) => (
          <MetricSection key={metric.metric} metric={metric} />
        ))}
      </View>
    </ScrollView>
  );
}

export default function MyScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <ThemedText type="smallBold">MY</ThemedText>
        </View>

        <View style={styles.body}>
          <MyModelBody />
        </View>
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
    paddingBottom: BottomTabInset,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
  centeredBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  scrollContent: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  headlineSection: {
    gap: Spacing.one,
  },
  headlineText: {
    fontSize: 24,
    lineHeight: 32,
  },
  metaSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
  },
  metricsSection: {
    gap: Spacing.three,
  },
  metricCard: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  metricCardTitle: {
    marginBottom: Spacing.one,
  },
  featureList: {
    gap: Spacing.two,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  featureLabel: {
    flexShrink: 1,
  },
  featureRatio: {
    fontSize: 13,
  },
});
