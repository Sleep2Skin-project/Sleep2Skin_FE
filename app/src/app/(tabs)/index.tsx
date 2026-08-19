import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLevelExpDisplay } from '@/api/game';
import {
  getSkinForecast,
  getSkinModel,
  getVerificationSummary,
  SkinModelUserNotFoundError,
  type SkinForecastDetail,
  type VerificationSummary,
} from '@/api/skin';
import { getSleepInterpretation, type SleepInterpretation } from '@/api/sleep';
import { getUserMe, type UserMeData } from '@/api/user';
import { SelfieVerificationFlow } from '@/components/selfie-verification-flow';
import { SleepDetailModal } from '@/components/sleep-detail-modal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { HOME_SUMMARY_MOCK, LEVEL_CHARACTER_HOME_BOX, LEVEL_CHARACTER_IMAGES } from '@/constants/mockData';
import { consumeAppStartForecast } from '@/hooks/use-app-start-forecast';
import { useDesignScale } from '@/hooks/use-design-scale';
import { useTodoChangedSignal } from '@/hooks/use-todo-changed-signal';

// HOME — Figma 'Ui' 파일 노드 187:2673("홈 화면")을 Figma REST API로 직접 읽어와
// 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것.
// 피부 예보/수면 통역/적중률·연속 검증 배너는 GET /api/v1/skin/forecast, /api/v1/sleep/interpretation,
// GET /api/v1/skin/verification/summary로, 레벨/exp/캐릭터는 GET /api/v1/users/me(MY-01, 마이 탭과
// 같은 소스)로 연동했다. 날짜/인사말처럼 대응하는 API가 아직 없는 항목만 mockData.ts의
// HOME_SUMMARY_MOCK을 그대로 쓴다.
// 단, 피부 예보는 앱 시작 직후엔 GET /skin/forecast를 아예 안 부를 수 있다 — _layout.tsx가 이미
// POST /sleep/sessions로 오늘 예보를 받아왔으면 그 값을 재사용한다(use-app-start-forecast.ts,
// "앱 시작 직후엔 그 API가 필요 없다"는 스펙 규칙). 캐시가 없을 때만 이 조회로 폴백한다.
// 좌표는 모두 프레임(node 187:2673) 원점 기준 상대값이며, 값은 Figma가 반환한 절대좌표에서 프레임 원점을 뺀 것이다.
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링).
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

// 🚨 스케일 계산에는 CANVAS_HEIGHT(874)가 아니라 이 값을 쓴다 — 실제 콘텐츠는 셰브론
// 아이콘(top:774 + h:13)에서 끝나고(y:787), 그 아래 874까지 87pt는 예전에 캔버스 안에 직접
// 그려져 있던 하단 탭바가 네이티브 탭바(app-tabs.tsx)로 옮겨가면서 남은 빈 배경이다. 이 빈
// 여백까지 안전 영역에 욱여넣으려고 useDesignScale이 캔버스 전체를 필요 이상으로(약 0.87배)
// 축소해서, 아이폰 16 실기기에서 버튼·캐릭터 등이 다 작아 보이고 화면 좌우에 빈 여백이 남는
// 문제가 있었다(docs/아이폰16.jpg). 실제 콘텐츠 높이(+약간의 여유)만 기준으로 스케일을 잡으면
// 이 빈 공간은 화면 아래로(탭바 뒤로) 자연스럽게 넘어가고 보이는 내용물은 거의 원본 크기로
// 나온다. 콘텐츠가 늘어나 이 값을 넘으면(예: 텍스트가 길어져 요소가 밀리면) 다시 잘릴 수 있으니
// 하단 요소 좌표가 바뀌면 이 값도 같이 확인한다.
const SCALE_FIT_HEIGHT = 800;

// 레벨 트랙 폭(w:95.4) — Figma 원본 px 값을 그대로 사용. 채움 폭은 getLevelExpDisplay의 percent로 계산한다.
const LEVEL_TRACK_WIDTH = 95.4;

// "50/250 exp" 배지 전용 픽셀 폰트(node 541:3482) — 이 화면에만 로컬로 번들링한다(TODO(todo.tsx)의
// exp 배지와 동일한 패턴).
const PRESS_START_2P = 'PressStart2P-Regular';
const EXP_TEXT_FONTS = {
  [PRESS_START_2P]: require('@/assets/fonts/PressStart2P-Regular.ttf'),
};

const VERIFY_BUTTON_LABEL = '5초 셀피로 오늘 예보 검증하기';
const UNAVAILABLE_METRIC_COLOR = '#9E9E9E';

// MY-01(GET /api/v1/users/me)과 동일한 프로필 응답에서 레벨/exp를 가져온다(마이 탭 my.tsx와
// 같은 패턴). 이 API엔 빈 상태가 없어 loading/error/available 세 상태만 관리하면 된다.
type ProfileState = { status: 'loading' } | { status: 'error' } | { status: 'available'; profile: UserMeData };

const FORECAST_METRIC_LABELS = {
  darkCircle: '다크서클',
  complexion: '안색',
  barrier: '장벽',
} as const;

type ForecastState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string }
  | { status: 'available'; forecast: SkinForecastDetail };

type InterpretationState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string }
  | { status: 'available'; interpretation: SleepInterpretation };

type VerificationSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string | null }
  | { status: 'available'; summary: VerificationSummary };

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const WEEKDAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// 상단 "8월 6일 목요일" — HOME_SUMMARY_MOCK.date.label이 그 문자열 그대로 하드코딩돼 있어서 날짜가
// 절대 안 바뀌는 버그였다(대응 API가 없는 항목이라 목업을 썼었는데, 오늘 날짜는 애초에 서버 API가
// 필요 없는 값이라 굳이 목업으로 둘 이유가 없다). 다른 화면들의 getTodayDateString과 동일하게
// 로컬 Date에서 직접 계산한다.
function formatTodayHeading(): string {
  const now = new Date();
  return `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY_LABELS_KO[now.getDay()]}요일`;
}

/**
 * grade는 백엔드가 자유 문자열로 내려줘 고정 enum이 없다(한글 "안정"/영문 "STABLE"처럼 표기가
 * 섞여 올 수 있음). 디자인 시안 4단계(위험-빨강 / 주의-주황 / 보통-초록 / 안정-파랑) 기준으로
 * 키워드 매칭해 라벨은 한글로, 색은 시안 배색으로 통일한다. 매칭되는 키워드가 없으면 원문
 * grade를 그대로 보여주고 색은 안전 쪽(success)으로 폴백한다.
 */
const GRADE_RULES: { keywords: string[]; label: string; color: string }[] = [
  { keywords: ['위험', 'DANGER', 'BAD'], label: '위험', color: Colors.danger },
  { keywords: ['주의', '경고', 'WARN', 'CAUTION'], label: '주의', color: Colors.warning },
  { keywords: ['안정', 'STABLE'], label: '안정', color: Colors.accentBlue },
  { keywords: ['보통', 'NORMAL', 'MODERATE'], label: '보통', color: Colors.success },
];

function resolveGrade(grade: string): { label: string; color: string } {
  const normalized = grade.toUpperCase();
  const matched = GRADE_RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword.toUpperCase())));
  return matched ?? { label: grade, color: Colors.success };
}

function buildForecastRows(forecast: SkinForecastDetail) {
  const entries: [key: keyof typeof FORECAST_METRIC_LABELS, metric: SkinForecastDetail['darkCircle'] | null][] = [
    ['darkCircle', forecast.darkCircle],
    ['complexion', forecast.complexion],
    ['barrier', forecast.barrier],
  ];
  return entries.map(([key, metric]) => {
    const grade = metric ? resolveGrade(metric.grade) : null;
    return {
      key,
      label: FORECAST_METRIC_LABELS[key],
      value: metric?.score ?? 0,
      status: grade?.label ?? '측정 불가',
      color: grade?.color ?? UNAVAILABLE_METRIC_COLOR,
    };
  });
}

/**
 * headline은 항상 완결된 문장(수치+피부과학 팁)이라 그대로 본문으로 쓴다.
 * focus.label은 "깊은 수면"처럼 완결되지 않은 짧은 명사구라, headline 아래 세 번째
 * 문장처럼 이어붙이면 말이 끊겨 보인다. 그래서 문장으로 취급하지 않고 별도 칩(pill)
 * 라벨로 렌더링한다(아래 JSX의 tooltipFocusChip).
 */
function buildTooltipContent(state: InterpretationState): { headline: string; focusLabel: string | null } {
  if (state.status === 'loading') return { headline: '불러오는 중...', focusLabel: null };
  if (state.status === 'error') return { headline: '수면 통역을 불러오지 못했어요', focusLabel: null };
  if (state.status === 'no_data') return { headline: state.message, focusLabel: null };
  const { interpretation } = state;
  return interpretation.tone === 'PRAISE'
    ? { headline: interpretation.headline, focusLabel: null }
    : { headline: interpretation.headline, focusLabel: interpretation.focus.label };
}

/**
 * 검증 트리거 아래 한 줄 요약(HOME-09, getVerificationSummary). summary.hitRate는 누적 적중률이라
 * AccuracyCard(selfie-verification-flow.tsx)와 동일하게 "누적"이라 명시하고, latest.hitRate(그날치)와
 * 섞어 쓰지 않는다.
 */
function buildVerificationSummaryText(state: VerificationSummaryState): string {
  if (state.status === 'loading') return '불러오는 중...';
  if (state.status === 'error') return '적중률 정보를 불러오지 못했어요';
  if (state.status === 'no_data') {
    return state.message ?? '아직 검증 이력이 없어요 · 셀피로 첫 검증을 시작해보세요';
  }
  const { summary } = state;
  return summary.streakCount > 0
    ? `누적 예보 적중률 ${summary.hitRate}% · ${summary.streakCount}일 연속 검증 중`
    : `누적 예보 적중률 ${summary.hitRate}% · 오늘 검증하고 기록을 이어가 보세요`;
}

function ForecastGaugeRow({
  label,
  value,
  status,
  statusColor,
}: {
  label: string;
  value: number;
  status: string;
  statusColor: string;
}) {
  return (
    <View style={styles.gaugeRow}>
      <ThemedText style={styles.gaugeLabel}>{label}</ThemedText>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${value}%` }]} />
      </View>
      <ThemedText style={styles.gaugeValue}>
        {value} · <ThemedText style={[styles.gaugeStatus, { color: statusColor }]}>{status}</ThemedText>
      </ThemedText>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const scale = useDesignScale(CANVAS_WIDTH, SCALE_FIT_HEIGHT);
  const [expFontLoaded] = useFonts(EXP_TEXT_FONTS);
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [selfieFlowVisible, setSelfieFlowVisible] = useState(false);
  const [forecastState, setForecastState] = useState<ForecastState>({ status: 'loading' });
  const [interpretationState, setInterpretationState] = useState<InterpretationState>({ status: 'loading' });
  const [verificationSummaryState, setVerificationSummaryState] = useState<VerificationSummaryState>({
    status: 'loading',
  });
  // MY-01과 동일한 프로필 응답 — 레벨/exp/캐릭터 이미지를 여기서 채운다(마이 탭과 같은 값이라
  // 항상 일치해야 함).
  const [profileState, setProfileState] = useState<ProfileState>({ status: 'loading' });

  // TODO 탭에서 체크리스트를 토글해 exp/레벨이 바뀌면 이 화면도 다시 조회해야 한다 — 탭
  // 네비게이터가 화면을 언마운트하지 않아서 마운트 시 한 번만 조회하면 탭을 옮겨도 옛 값에
  // 머문다(use-todo-changed-signal.ts). 프로필만 별도 effect로 분리해 신호가 올 때마다 재조회한다.
  const todoChangedSignal = useTodoChangedSignal();

  useEffect(() => {
    getUserMe(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => setProfileState({ status: 'available', profile: data }))
      .catch((error) => {
        console.error('❌ 프로필 조회 실패:', error);
        setProfileState({ status: 'error' });
      });
  }, [todoChangedSignal]);

  useEffect(() => {
    const baseDate = getTodayDateString();

    // 앱 시작 시 _layout.tsx가 POST /sleep/sessions로 이미 오늘 예보를 받아왔다면 그 값을
    // 그대로 쓴다 — GET /skin/forecast는 "이미 받은 예보를 날짜 바꿔 다시 볼 때"만 필요하다는
    // 스펙 규칙(use-app-start-forecast.ts 참고). 캐시가 없으면(HealthKit 데이터 없음/업로드
    // 실패/이미 소비됨 등) 기존처럼 조회한다.
    const appStartForecast = consumeAppStartForecast(baseDate);
    if (appStartForecast) {
      setForecastState({ status: 'available', forecast: appStartForecast });
    } else {
      getSkinForecast(baseDate, TEMP_USER_ID)
        .then(({ data }) => {
          setForecastState(
            data.status === 'AVAILABLE'
              ? { status: 'available', forecast: data.forecast }
              : { status: 'no_data', message: data.message }
          );
        })
        .catch(() => setForecastState({ status: 'error' }));
    }

    getSleepInterpretation(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        setInterpretationState(
          data.status === 'AVAILABLE'
            ? { status: 'available', interpretation: data.interpretation }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch(() => setInterpretationState({ status: 'error' }));

    // REP-12 테스트 호출: 내 모델 - 일반 vs 개인화 (userId: 1 고정)
    getSkinModel(1)
      .then(({ data }) => {
        if (data.status === 'NO_VERIFICATION') {
          console.log(
            `✅ 내 모델 조회 성공: 상태 NO_VERIFICATION (아직 검증 이력 없음, message: ${data.message ?? '없음'})`
          );
        } else {
          console.log(
            `✅ 내 모델 조회 성공: 상태 AVAILABLE (누적 검증 횟수: ${data.model.verificationCount}, 헤드라인: ${data.model.headline})`
          );
        }
      })
      .catch((error) => {
        if (error instanceof SkinModelUserNotFoundError) {
          console.error(`❌ 내 모델 조회 실패: 존재하지 않는 사용자 (userId: ${error.userId})`);
          return;
        }
        console.error('❌ 내 모델 조회 실패:', error);
      });

    // 테스트용 셀피 검증 호출: verifySelfie(1, "2026-08-07", "dummy_uri")
    // (카메라 기능 미구현으로 아직 호출하지 않음)

    // HOME-09: 적중률·연속 검증 배너 (검증 트리거 아래 한 줄 요약)
    getVerificationSummary(TEMP_USER_ID, baseDate)
      .then(({ data }) => {
        setVerificationSummaryState(
          data.status === 'AVAILABLE'
            ? { status: 'available', summary: data.summary }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch((error) => {
        if (error instanceof SkinModelUserNotFoundError) {
          console.error(`❌ 배너 조회 실패: 존재하지 않는 사용자 (userId: ${error.userId})`);
        } else {
          console.error('❌ 배너 조회 실패:', error);
        }
        setVerificationSummaryState({ status: 'error' });
      });
  }, []);

  const profile = profileState.status === 'available' ? profileState.profile : null;
  const level = profile?.level ?? 1;
  const tooltipContent = buildTooltipContent(interpretationState);
  const expDisplay = getLevelExpDisplay(profile);
  const characterImage = LEVEL_CHARACTER_IMAGES[level] ?? LEVEL_CHARACTER_IMAGES[1];
  const characterBox = LEVEL_CHARACTER_HOME_BOX[level] ?? LEVEL_CHARACTER_HOME_BOX[1];

  return (
    <>
      <SafeAreaView style={styles.screen}>
        <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
            {/* 배경 (fill #DFEAFF) */}
            <View style={StyleSheet.absoluteFill} />

            {/* 상단 안내 문구 (날짜 + 인사말) */}
            <View style={styles.dateGreetingBlock}>
              <ThemedText style={styles.dateText}>{formatTodayHeading()}</ThemedText>
              <View style={styles.greetingRow}>
                <Image source={require('@/assets/images/figma-icon-sun.png')} style={styles.sunIcon} contentFit="contain" />
                <ThemedText style={styles.greetingText}>{HOME_SUMMARY_MOCK.greeting.message}</ThemedText>
              </View>
            </View>

            {/* 캐릭터 레벨 — MY-01(GET /api/v1/users/me) 실값(마이 탭과 동일 소스). */}
            <ThemedText style={styles.levelText}>LEVEL. {level}</ThemedText>
            <View style={styles.levelTrack}>
              <View style={[styles.levelFill, { width: `${expDisplay.percent}%` }]} />
            </View>
            {/* "50/250 exp" (node 541:3482, x:38 y:160 w:177.64 h:23) — MY-01 totalExp/nextLevelExp로
                계산한 실값(getLevelExpDisplay). 픽셀 폰트 로드 전엔 시스템 폰트로 잠깐 바뀌어 보이는
                걸 막기 위해 렌더하지 않는다. */}
            {expFontLoaded && (
              <ThemedText style={styles.expText}>
                {expDisplay.current}/{expDisplay.max} exp
              </ThemedText>
            )}

            {/* 캐릭터 — MY-01의 level로 5종 이미지 중 하나를 고른다(LEVEL_CHARACTER_IMAGES). 박스도
                레벨별로 다르다(LEVEL_CHARACTER_HOME_BOX) — 레벨마다 Figma 원본 PNG의 내부 여백이
                달라 5종 공용 박스를 쓰면 레벨2·3처럼 중앙이 안 맞았다. */}
            <Image
              source={characterImage}
              style={[styles.characterImage, characterBox]}
              contentFit="cover"
            />

            {/* 수면 요약 툴팁 카드 */}
            <Pressable onPress={() => router.push('/report')} style={({ pressed }) => [pressed && styles.pressed]}>
              <LinearGradient
                style={styles.tooltipCard}
                colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.22)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}>
                <View style={styles.tooltipIconSlot} />
                <View style={styles.tooltipTextBlock}>
                  <ThemedText style={styles.tooltipText}>{tooltipContent.headline}</ThemedText>
                  {tooltipContent.focusLabel && (
                    <View style={styles.tooltipFocusChip}>
                      <ThemedText style={styles.tooltipFocusChipText}>#{tooltipContent.focusLabel}</ThemedText>
                    </View>
                  )}
                </View>
              </LinearGradient>
            </Pressable>
            <Image source={require('@/assets/images/figma-icon-bed.png')} style={styles.tooltipIcon} contentFit="contain" />

            {/* 오늘의 피부 예보 카드 */}
            <View style={styles.forecastCard}>
              <View style={styles.forecastTitleRow}>
                <Image
                  source={require('@/assets/images/figma-icon-barchart.png')}
                  style={styles.forecastTitleIcon}
                  contentFit="contain"
                />
                <ThemedText style={styles.forecastTitle}>{HOME_SUMMARY_MOCK.skinForecast.title}</ThemedText>
              </View>
              {forecastState.status === 'loading' && (
                <ThemedText style={styles.forecastDisclaimer}>불러오는 중...</ThemedText>
              )}
              {forecastState.status === 'error' && (
                <ThemedText style={styles.forecastDisclaimer}>피부 예보를 불러오지 못했어요</ThemedText>
              )}
              {forecastState.status === 'no_data' && (
                <ThemedText style={styles.forecastDisclaimer}>{forecastState.message}</ThemedText>
              )}
              {forecastState.status === 'available' && (
                <View style={styles.gaugeList}>
                  {buildForecastRows(forecastState.forecast).map((item) => (
                    <ForecastGaugeRow
                      key={item.key}
                      label={item.label}
                      value={item.value}
                      status={item.status}
                      statusColor={item.color}
                    />
                  ))}
                </View>
              )}
              <ThemedText style={styles.forecastDisclaimer}>{HOME_SUMMARY_MOCK.skinForecast.disclaimer}</ThemedText>
            </View>

            {/* 검증 버튼 + 트리거 */}
            <Pressable onPress={() => setSelfieFlowVisible(true)} style={({ pressed }) => [styles.verifyButton, pressed && styles.pressed]}>
              <ThemedText style={styles.verifyButtonText}>{VERIFY_BUTTON_LABEL}</ThemedText>
            </Pressable>

            <View style={styles.verificationTrigger}>
              <ThemedText style={styles.verificationSummary}>
                {buildVerificationSummaryText(verificationSummaryState)}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => setSleepModalVisible(true)}
              hitSlop={12}
              style={({ pressed }) => [styles.chevronIcon, pressed && styles.pressed]}>
              <Image
                source={require('@/assets/images/figma-icon-chevron-up.png')}
                style={styles.chevronImage}
                contentFit="contain"
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <SleepDetailModal visible={sleepModalVisible} onClose={() => setSleepModalVisible(false)} />
      <SelfieVerificationFlow
        visible={selfieFlowVisible}
        onClose={() => setSelfieFlowVisible(false)}
        onFinish={() => {
          setSelfieFlowVisible(false);
          router.push('/todo');
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  // 프레임(node 187:2673): 402x874, fill #DFEAFF
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: Colors.bgSoftBlue,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },

  // "8월 6일 목요일 좋은 아침이에요" (node 187:2710, x:31 y:55 w:195 h:68) — 혼합 스타일 텍스트 런
  dateGreetingBlock: {
    position: 'absolute',
    left: 31,
    top: 55,
  },
  dateText: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '400',
    color: '#646464',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  sunIcon: {
    width: 24,
    height: 24,
  },
  greetingText: {
    marginLeft: 8,
    fontSize: 25,
    lineHeight: 35,
    fontWeight: '700',
    color: '#000000',
  },
  // "LEVEL. 3" (node 187:2703, x:37 y:134 w:103.35 h:17.06)
  levelText: {
    position: 'absolute',
    left: 37,
    top: 134,
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  // 레벨 트랙 배경 value (node 187:2704, x:107.17 y:140.02 w:95.4 h:6.98, radius:5.82)
  levelTrack: {
    position: 'absolute',
    left: 107,
    top: 140,
    width: LEVEL_TRACK_WIDTH,
    height: 7,
    borderRadius: 6,
    backgroundColor: Colors.mutedGray,
    overflow: 'hidden',
  },
  // 레벨 트랙 채움 value (node 187:2705, x:107 y:140 w:34 h:7, radius:5.82)
  levelFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: Colors.primaryDark,
  },
  // "50/250 exp" (node 541:3482, x:38 y:160 w:177.64 h:23, Press Start 2P 11px)
  expText: {
    position: 'absolute',
    left: 38,
    top: 160,
    fontSize: 11,
    lineHeight: 23,
    fontFamily: PRESS_START_2P,
    color: Colors.primaryDark,
  },

  // 레벨별 박스는 LEVEL_CHARACTER_HOME_BOX(mockData.ts)에서 인라인으로 얹는다.
  characterImage: {
    position: 'absolute',
  },

  // "div" 수면 요약 툴팁 카드 (node 187:2679, x:181 y:158 w:199 h:78, radius:25.3) — 목업 시절엔
  // "깊은 수면이" / "32분 부족했어요" 같은 짧은 2줄이었지만, 실제 API 메시지(특히 NO_SLEEP_DATA의
  // message)는 길이를 예측할 수 없어서 height를 고정하지 않고 minHeight로 바꿔 내용만큼 늘어나게
  // 했다. 아래로 481px(오늘의 피부 예보 카드)까지 충분히 여유가 있어 늘어나도 안 겹친다.
  tooltipCard: {
    position: 'absolute',
    left: 181,
    top: 158,
    width: 199,
    minHeight: 78,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 21,
    gap: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#5A6EA0',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 4,
  },
  // "span" 아이콘 슬롯 (node 187:2680, w:19 h:24) — 실제 아이콘은 Person In Bed 레이어로 위에 겹쳐 그린다.
  tooltipIconSlot: {
    width: 19,
    height: 24,
  },
  // 아이콘 옆 텍스트 칸 — flex:1로 카드 남은 폭 안에서만 줄바꿈되게 잡아준다(안 그러면 텍스트가
  // 카드 폭을 무시하고 옆으로 삐져나갈 수 있다).
  tooltipTextBlock: {
    flex: 1,
  },
  // 목업 2줄 문구 기준으로 16px이었는데, 실제 메시지는 한 문장으로 오는 경우가 많아 그대로 두면
  // 글자가 카드 밖으로 잘렸다. 폭 안에서 여러 줄로 편하게 접히도록 줄였다.
  tooltipText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#1C2430',
  },
  // focus.label("깊은 수면" 같은 짧은 명사구)을 headline 아래 세 번째 문장처럼 잇지 않고
  // 독립된 태그로 보여주는 칩. alignSelf: 'flex-start'로 글자 길이만큼만 감싸 카드 폭을
  // 다 채우지 않게 한다.
  tooltipFocusChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(51, 102, 255, 0.14)',
  },
  tooltipFocusChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: Colors.accentBlue,
  },
  // Person In Bed (node 187:2702, x:198 y:186 w:27 h:27) — 프레임 루트의 독립 레이어(플로팅)
  tooltipIcon: {
    position: 'absolute',
    left: 198,
    top: 186,
    width: 27,
    height: 27,
  },

  // "오늘의 피부 예보" 카드 (node 187:2683, x:22 y:481 w:358 h:185.77, radius:16.6)
  forecastCard: {
    position: 'absolute',
    left: 22,
    top: 481,
    width: 358,
    height: 186,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderWidth: 1,
    borderColor: '#DCDCDC',
    padding: 19,
    gap: 12,
  },
  forecastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  forecastTitleIcon: {
    width: 22,
    height: 22,
  },
  forecastTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  gaugeList: {
    gap: 12,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeLabel: {
    width: 58,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#6B6B6B',
  },
  gaugeTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(181, 194, 207, 0.75)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primaryDark,
  },
  gaugeValue: {
    width: 86,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  gaugeStatus: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  forecastDisclaimer: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    color: '#9E9E9E',
  },

  // Button 인스턴스 (node 187:2675, x:29 y:686 w:345 h:52, radius:10)
  verifyButton: {
    position: 'absolute',
    left: 29,
    top: 686,
    width: 345,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
  verifyButtonText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.white,
  },

  // "어제 예보 적중률..." (node 187:2677, x:30 y:750 w:345 h:17)
  verificationTrigger: {
    position: 'absolute',
    left: 30,
    top: 750,
    width: 345,
    alignItems: 'center',
  },
  verificationSummary: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'center',
  },
  // Vector 쉐브론 (node 187:2706, x:190 y:774 w:23 h:13)
  chevronIcon: {
    position: 'absolute',
    left: 190,
    top: 774,
    width: 23,
    height: 13,
  },
  chevronImage: {
    width: '100%',
    height: '100%',
  },
});
