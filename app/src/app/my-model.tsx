import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateModelReliability, getSkinModel, SkinModelUserNotFoundError, type SkinModelDetail } from '@/api/skin';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';

// "MY" 상세 페이지 (Figma 'Ui' 파일 노드 541:3144, "iPhone 17 - 24") — GET /api/v1/skin/model
// (REP-12, getSkinModel) 데이터를 이 시안 그대로 바인딩한다. my.tsx(MY 탭, 레벨/EXP/투두 요약)
// 우상단 톱니바퀴 아이콘을 누르면 router.push('/my-model')로 이 페이지에 온다.
//
// 처음엔 RN Modal로 띄웠는데, 이 프로젝트의 웹 테스트 환경(react-native-web)에서 Modal이
// 탭해도 바로 안 뜨는 문제가 있어(react-native-web의 Modal 포털/스택 처리가 네이티브와 달라
// 애니메이션이 씹히거나 렌더가 지연됨) — 실제 라우트(페이지)로 바꿨다. 뒤로가기는 router.back().
//
// 카드/피처 개수가 API 응답에 따라 달라질 수 있어(Figma 예시는 혈색 카드 3항목·피부장벽
// 2항목·다크서클 2항목) index.tsx/todo.tsx처럼 402 고정 캔버스에 절대좌표를 박아넣지 않고,
// Figma 요소 사이 간격만 margin/gap으로 옮긴 flex 흐름 레이아웃을 쓴다 — 카드 높이도 실제
// 피처 개수에 맞춰 자동으로 늘어난다.
const PRETENDARD_REGULAR = 'Pretendard-Regular';
const PRETENDARD_MEDIUM = 'Pretendard-Medium';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const MY_MODEL_FONTS = {
  [PRETENDARD_REGULAR]: require('@/assets/fonts/Pretendard-Regular.otf'),
  [PRETENDARD_MEDIUM]: require('@/assets/fonts/Pretendard-Medium.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
};

// metric 필드(DARK_CIRCLE/BARRIER/COMPLEXION) → 표시 라벨. 이 화면(node 541:3144)이 쓰는 정확한
// 한글 표기("혈색"/"피부 장벽")를 그대로 따른다 — 홈 화면 피부 예보 카드의 "안색"/"장벽"(짧은
// 표기)과는 문맥이 달라 다를 수 있다.
const METRIC_LABELS: Record<string, string> = {
  DARK_CIRCLE: '다크서클',
  BARRIER: '피부 장벽',
  COMPLEXION: '혈색',
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

// 신뢰도 뱃지 (node 541:3149/3150, w:83 h:22, fill #CEE0FF, border #3366FF 1px, radius:20) —
// calculateModelReliability(count)가 매긴 등급(下/中/上)을 그대로 텍스트로 보여준다.
function ReliabilityBadge({ count }: { count: number }) {
  const grade = calculateModelReliability(count);

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>신뢰도 {grade}</Text>
    </View>
  );
}

// 지표 카드 (node 541:3162/3168/3170, border #BABABA 1px, radius:22, 배경 투명 — 화면 배경
// #DFEAFF가 그대로 비친다)
function MetricSection({ metric }: { metric: SkinModelDetail['metrics'][number] }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricCardTitle}>{metricLabel(metric.metric)}</Text>

      <View style={styles.featureList}>
        {metric.features.map((feature) => (
          <View key={feature.feature} style={styles.featureRow}>
            <Text style={styles.featureLabel}>{feature.label}</Text>
            <Text style={styles.featureRatio}>일반 대비 {feature.ratio.toFixed(1)}배</Text>
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
        <Text style={styles.placeholderText}>유저 정보를 찾을 수 없어요</Text>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.centeredBody}>
        <Text style={styles.placeholderText}>내 모델 정보를 불러오지 못했어요</Text>
      </View>
    );
  }

  if (state.status === 'no_verification') {
    return (
      <View style={styles.centeredBody}>
        <Text style={styles.placeholderText}>
          {state.message ?? '아직 나만의 모델이 없어요. 첫 셀피 검증을 완료해 보세요!'}
        </Text>
      </View>
    );
  }

  const { model } = state;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* 헤드라인 (node 541:3147) */}
      <Text style={styles.headlineText}>{model.headline}</Text>

      {/* 누적 검증 횟수 + 신뢰도 뱃지 (node 541:3148~3150) */}
      <View style={styles.metaSection}>
        <Text style={styles.metaText}>누적 검증 {model.verificationCount}회</Text>
        <ReliabilityBadge count={model.verificationCount} />
      </View>

      {/* 지표 카드 목록 (node 541:3162/3168/3170) — metrics 배열을 카드로 순회 */}
      <View style={styles.metricsSection}>
        {model.metrics.map((metric) => (
          <MetricSection key={metric.metric} metric={metric} />
        ))}
      </View>
    </ScrollView>
  );
}

export default function MyModelScreen() {
  const router = useRouter();
  const [fontsLoaded] = useFonts(MY_MODEL_FONTS);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBackButton}>
            <Text style={styles.headerBackButtonText}>{'‹'}</Text>
          </Pressable>
          {/* "MY" (node 541:3146, x:180 y:60 w:42 h:36, fontSize:30, 중앙 정렬) */}
          <Text style={styles.headerTitle}>MY</Text>
          <View style={styles.headerBackButton} />
        </View>

        {/* 폰트 로드 전엔 렌더하지 않는다 — 시스템 폰트로 잠깐 렌더돼 줄바꿈이 튀는 걸 막는다. */}
        <View style={styles.body}>{fontsLoaded && <MyModelBody />}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 화면 배경 (node 541:3144, fill #DFEAFF) — 다른 화면들과 동일한 배경색.
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 800,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Figma 시안엔 닫기 동작이 없어(캡처 프레임이라 그런 듯) 뒤로가기 버튼은 임의로 추가한
  // 것이다 — "MY" 제목과 균형 맞춰 중앙 정렬되도록 오른쪽에 같은 폭의 빈 자리를 하나 더 둔다.
  headerBackButton: {
    width: 40,
  },
  headerBackButtonText: {
    fontSize: 28,
    color: '#000000',
  },
  // "MY" (node 541:3146, fontSize:30, Noto Sans KR Medium → 번들 폰트가 없어 시스템 굵기로 대체)
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '500',
    color: '#000000',
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
    color: '#000000',
  },
  // Figma 요소 간 세로 간격(제목→헤드라인 24, 헤드라인→메타 24, 메타→카드1 16, 카드 사이
  // ~15)을 gap으로 옮겼다 — 카드 높이가 API 피처 개수에 따라 달라지므로 절대좌표 대신 흐름
  // 레이아웃을 쓴다(위 컴포넌트 주석 참고).
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 48,
    gap: 20,
  },
  // 헤드라인 (node 541:3147, Pretendard SemiBold 23px)
  headlineText: {
    fontSize: 23,
    lineHeight: 28,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#000000',
  },
  // 누적 검증 + 신뢰도 뱃지 행 (node 541:3148~3150)
  metaSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  // "누적 검증 21회" (node 541:3148, Pretendard Medium 15px, #5E5E5E)
  metaText: {
    fontSize: 15,
    fontFamily: PRETENDARD_MEDIUM,
    color: '#5E5E5E',
  },
  // 신뢰도 뱃지 (node 541:3149/3150, fill #CEE0FF, border #3366FF, radius:20)
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3366FF',
    backgroundColor: '#CEE0FF',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#3366FF',
  },
  metricsSection: {
    gap: 15,
  },
  // 지표 카드 (node 541:3162/3168/3170, border #BABABA, radius:22, 배경 투명)
  metricCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#BABABA',
    backgroundColor: 'transparent',
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  // 카드 제목 (node 541:3151/3163/3169, Pretendard SemiBold 19px)
  metricCardTitle: {
    marginBottom: 14,
    fontSize: 19,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#000000',
  },
  featureList: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // 피처 라벨 (node 541:3158/3160 등, Pretendard Regular 19px)
  featureLabel: {
    flexShrink: 1,
    fontSize: 19,
    fontFamily: PRETENDARD_REGULAR,
    color: '#000000',
  },
  // "일반 대비 N.N배" (node 541:3153 등, Pretendard Regular 15px, #7A7A7A)
  featureRatio: {
    fontSize: 15,
    fontFamily: PRETENDARD_REGULAR,
    color: '#7A7A7A',
  },
});
