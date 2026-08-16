import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  getDailyReport,
  getDailyTimeline,
  getWeeklyReport,
  type DailyReportForecastMetric,
  type DailyReportSleepSummary,
} from '@/api/report';
import type { SleepStats } from '@/api/sleep';
import { SleepScoreGamificationModal } from '@/components/report/sleep-score-gamification-modal';
import { ThemedText } from '@/components/themed-text';
import { TEMP_USER_ID } from '@/constants/config';
import { formatTimeKST } from '@/utils/format-time';

// 일간 리포트 (REP-02, 04, 05) — Figma 'Ui (복사)' 파일 node 350:698("리포트- 일간")을 Dev Mode 값
// (색상 hex/폰트/여백/radius) 그대로 옮긴 것. 탭 전환 세그먼트(일간/주간/월간/종합)와 하단 탭바는
// report.tsx/app-tabs.tsx가 소유하는 공용 UI라 이 파일에서는 건드리지 않는다.
// index.tsx/onboarding-flow.tsx와 달리 이 화면은 고정 캔버스에 절대좌표를 옮기지 않고, Figma가 준
// 좌표 간격을 padding/gap으로 환산해 Flexbox로 짜서 기기 폭에 반응형으로 채운다(카드 폭 등도 %/flex).
//
// GET /api/v1/report/daily(REP-02/04/05)로 "지난밤 수면 구간" 카드/통계 카드/오늘의 피부 예보를,
// GET /api/v1/report/daily/timeline(REP-03, sleep-detail-modal.tsx와 같은 API)로 취침~기상 시각을
// 연동한다. 두 API는 완전히 독립적이라(같은 baseDate라도 서로 다른 status를 가질 수 있음) 아래
// sleepSummaryState/skinForecastState/sleepWindowState 세 상태를 각자 따로 관리한다 — 한쪽이
// NO_SLEEP_DATA라고 다른 쪽까지 숨기지 않는다.
const DATE_RANGE_LABEL = '최근 7일 · 7/25 – 7/31';

/** "OOO님의 어제" — nickname은 report.tsx가 GET /api/v1/users/me로 한 번만 불러 내려준다. 로딩/에러
 * 중(null)엔 이름 없이도 자연스러운 "나의 어제"로 대체한다. */
function buildUserHeading(nickname: string | null) {
  return nickname ? `${nickname}님의 어제` : '나의 어제';
}

// report/daily·report/daily/timeline 어디에도 없는 필드(REM 수면 분)만 값이 생기기 전까지 목업으로
// 채운다. 입면/기상 시각은 이제 timeline API 실값을 쓴다(아래 sleepWindowState 참고).
const SLEEP_REM_MOCK = {
  remSleepMinutes: 202, // 3시간 22분
};

// 게이미케이션(경험치) 팝업 — "어제보다 오늘 수면 점수가 높으면" 트리거는 GET /api/v1/report/weekly의
// dailyScores(최근 7일치 점수 배열, weekly-report.tsx와 같은 API)로 실연동한다. report/daily의
// sleepScore는 어제 값을 함께 주지 않지만(diffFromYesterday 없음), weekly가 이미 어제·오늘 점수를
// 둘 다 갖고 있어 그 두 값을 프론트에서 비교하면 된다 — 평균·합계를 다시 계산하는 게 아니라 서버가
// 준 개별 값 두 개를 그대로 빼는 것뿐이라 "재계산 금지" 규칙 위반이 아니다.
// exp 지급은 아직 다른 문제다 — "수면 점수 상승"에 대해 실제로 exp를 적립해주는 백엔드 엔드포인트/
// reason이 없어서(VERIFICATION_STREAK·TODO_DONE·TODO_ALL_DONE 셋뿐, api/game.ts·api/todo.ts 참고),
// 이 숫자만은 여전히 목업이다 — 트리거(뜨는지 여부)와 표시 점수/날짜는 실값, exp만 자리표시자.
// 백엔드에 전용 엔드포인트가 생기면 SLEEP_SCORE_EXP_MOCK을 그 응답값으로 교체할 것.
const SLEEP_SCORE_EXP_MOCK = 10;

/** "YYYY-MM-DD" → "YY년 M월 D일" (SleepScoreGamificationModal의 dateLabel 포맷). */
function formatSleepScoreDateLabel(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${year.slice(2)}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}분`;
  if (remainder === 0) return `${hours}시간`;
  return `${hours}시간 ${remainder}분`;
}

/**
 * report/daily의 DailyReportSleepSummary(실측) + report/daily/timeline의 취침~기상 시각(실측,
 * sleepWindow) + 아직 API에 없는 필드(REM만 목업)를 합쳐 기존 SleepStats 모양으로 만든다.
 * lightSleepMinutes → coreSleepMinutes 매핑이 핵심 규칙("얕은 수면(HealthKit asleepCore)을 리포트
 * 노출용으로 부르는 이름", api/report.ts 참고) — awakeCount/awakeMinutes는 재계산하지 않고 API
 * 값을 그대로 옮긴다. sleepWindow가 아직 없으면(로딩/에러/무데이터) 빈 문자열로 두고, 그 값을
 * 읽는 formatTimeKST가 알아서 '--:--'로 방어한다.
 */
function toHybridSleepStats(
  summary: DailyReportSleepSummary,
  sleepWindow: { sleepOnsetTime: string; wakeTime: string } | null
): SleepStats {
  return {
    sleepOnsetTime: sleepWindow?.sleepOnsetTime ?? '',
    wakeTime: sleepWindow?.wakeTime ?? '',
    totalSleepMinutes: summary.totalSleepMinutes,
    deepSleepMinutes: summary.deepSleepMinutes,
    remSleepMinutes: SLEEP_REM_MOCK.remSleepMinutes,
    coreSleepMinutes: summary.lightSleepMinutes,
    awakeCount: summary.awakeCount,
    awakeMinutes: summary.awakeMinutes,
  };
}

// "stages" 바(node 350:705~714) 세그먼트 색상 — SleepStats 필드명(core/deep/rem/awake)과 1:1로
// 맞췄다(Figma 원본은 바 레이어명과 범례 라벨/색이 서로 어긋나 있었는데, 데이터 하나로 통일하면서
// 정리했다).
const STAGE_COLORS = {
  core: '#D1D9E9',
  deep: '#031949',
  rem: '#465B8B',
  awake: '#919CB3',
} as const;

export type SleepTimelineSegment = {
  key: string;
  stage: keyof typeof STAGE_COLORS;
  minutes: number;
};

// Figma가 준 9개 세그먼트(55.85:68.74:40.81:6.44:47.26:62.3:35.44:5.37:13.96)의 시각적 배열(어느
// 단계가 몇 조각으로 나뉘어 몇 번째에 오는지)만 그대로 두고, 각 조각 길이는 실제 분(minute)에서
// 비례 배분한다 — SleepTimelineBar의 flex 비율 "계산식" 자체는 손대지 않았고(변경 금지 지시 준수),
// 그 계산식에 넣어줄 숫자만 데이터에서 매번 다시 뽑아내도록 만들었다.
const TIMELINE_SHAPE: { key: string; stage: keyof typeof STAGE_COLORS; weightWithinStage: number }[] = [
  { key: '1', stage: 'core', weightWithinStage: 0.424 },
  { key: '2', stage: 'deep', weightWithinStage: 0.595 },
  { key: '3', stage: 'rem', weightWithinStage: 0.539 },
  { key: '4', stage: 'awake', weightWithinStage: 0.545 },
  { key: '5', stage: 'deep', weightWithinStage: 0.405 },
  { key: '6', stage: 'core', weightWithinStage: 0.47 },
  { key: '7', stage: 'rem', weightWithinStage: 0.461 },
  { key: '8', stage: 'awake', weightWithinStage: 0.455 },
  { key: '9', stage: 'core', weightWithinStage: 0.106 },
];

function buildTimelineSegments(stats: SleepStats): SleepTimelineSegment[] {
  const stageMinutes: Record<keyof typeof STAGE_COLORS, number> = {
    core: stats.coreSleepMinutes,
    deep: stats.deepSleepMinutes,
    rem: stats.remSleepMinutes,
    awake: stats.awakeMinutes,
  };
  return TIMELINE_SHAPE.map((piece) => ({
    key: piece.key,
    stage: piece.stage,
    minutes: piece.weightWithinStage * stageMinutes[piece.stage],
  }));
}

// 범례(node 350:715) — 바와 같은 4개 단계 색을 그대로 재사용하고("각성"만 횟수라 별도 빨강),
// 문구는 SleepStats에서 매번 계산해서 만든다.
type LegendItem = { key: string; color: string; label: string; icon?: 'ring' };

function buildLegendRows(stats: SleepStats): LegendItem[][] {
  return [
    [
      { key: 'deep', color: STAGE_COLORS.deep, label: `깊은 수면 ${formatDuration(stats.deepSleepMinutes)}` },
      { key: 'core', color: STAGE_COLORS.core, label: `코어수면 ${formatDuration(stats.coreSleepMinutes)}` },
    ],
    [
      { key: 'rem', color: STAGE_COLORS.rem, label: `REM 수면 ${formatDuration(stats.remSleepMinutes)}` },
      { key: 'nonSleep', color: STAGE_COLORS.awake, label: `비수면 ${formatDuration(stats.awakeMinutes)}` },
    ],
    [{ key: 'arousal', color: '#E52222', label: `각성 ${stats.awakeCount}회`, icon: 'ring' }],
  ];
}

// "각성" 발생 시점 마커 (node 350:786, 350:787) — 표시 개수는 awakeCount와 맞춰야 하지만, 정확한
// 발생 시각까지는 SleepStats에 없어서(집계값만 내려옴) 위치 자체는 Figma 좌표를 그대로 둔다.
const AROUSAL_MARKER_POSITIONS = [36.3, 64.3];

// 지표 카드 6개(node 350:737~814, 최신 시안 기준 "제목 없음(7)" 스크린샷 참고) — 3열 x 2행,
// 좌→우 상→하 순서로 총 수면/깊은 수면/야간 각성/수면 점수/얕은 수면/각성 시간. 전부 report/daily
// 실값이다 — 수면 점수는 같은 응답의 sleepSummary.summary.sleepScore(위 sleepScoreBadge와 동일
// 소스), 깊은 수면은 stats.deepSleepMinutes(범례가 이미 쓰는 값과 동일). "잠든 시간"(입면 지연)은
// 이 6칸에 포함되지 않는 지표라 여기서 완전히 뺐다 — API에도 없고 디자인에도 없다.
function buildStatItems(stats: SleepStats, sleepScore: number) {
  return [
    { key: 'total', label: '총 수면', value: formatDuration(stats.totalSleepMinutes) },
    { key: 'deep', label: '깊은 수면', value: formatDuration(stats.deepSleepMinutes) },
    { key: 'wakeCount', label: '야간 각성', value: `${stats.awakeCount}회` },
    { key: 'score', label: '수면 점수', value: `${sleepScore}점` },
    { key: 'core', label: '얕은 수면', value: formatDuration(stats.coreSleepMinutes) },
    { key: 'wakeMinutes', label: '각성 시간', value: formatDuration(stats.awakeMinutes) },
  ];
}

// 오늘의 피부 예보 — report/daily의 skinForecast 실연동. 이 API가 내려주는 지표는
// darkCircle/complexion/barrier 3개뿐이라(눈 부기는 API에 없음) Figma의 4개 중 "눈 부기"를 뺐다.
// 3번째 지표가 빠지면서 남는 세로 공간은 아래 수면 카드 범례를 2열 x 3행으로 넓혀 쓰는 데 썼다.
// 트랙(node 350:751 등)은 배경 트랙 위에 today%만큼 진한 막대가 채워지는 형태다.
// (입면/기상 시각은 이제 timeline API 실값, REM 수면 분만 여전히 목업 — 위 SLEEP_REM_MOCK 참고.)
const UNAVAILABLE_METRIC_COLOR = '#9E9E9E';

const SKIN_METRIC_LABELS = {
  darkCircle: '다크서클',
  complexion: '혈색 저하',
  barrier: '장벽 저하',
} as const;

type SleepSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string | null }
  | { status: 'available'; summary: DailyReportSleepSummary };

type SkinForecastState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string | null }
  | {
      status: 'available';
      darkCircle: DailyReportForecastMetric;
      complexion: DailyReportForecastMetric;
      barrier: DailyReportForecastMetric;
    };

// report/daily/timeline(REP-03) — 취침~기상 시각만 필요하므로 segments는 이 화면에서 쓰지 않는다
// (구간별 타임라인 바는 sleep-detail-modal.tsx 소관). no_data엔 message가 없다 — 취침~기상 텍스트는
// formatTimeKST의 '--:--' 폴백으로 조용히 대체되고, 별도 안내 문구를 두지 않는다(sleepSummaryState가
// 이미 카드 전체의 로딩/에러/빈 상태를 보여주므로 중복 안내를 피한다).
type SleepWindowState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data' }
  | { status: 'available'; sleepOnsetTime: string; wakeTime: string };

// SleepScoreGamificationModal 트리거 — report/weekly의 dailyScores(최근 7일)에서 오늘·어제 두
// 항목을 찾아 비교한다. 'ready'는 "비교는 끝났고 상승하지 않았거나 비교 불가"(팝업 안 띄움),
// 'increased'는 상승(팝업 띄움) — 둘을 분리해두면 렌더링에서 오탐 없이 명확하게 분기할 수 있다.
type SleepScoreCompareState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'increased'; score: number; dateLabel: string };

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildSkinReportRows(state: Extract<SkinForecastState, { status: 'available' }>) {
  const entries: [key: keyof typeof SKIN_METRIC_LABELS, metric: DailyReportForecastMetric][] = [
    ['darkCircle', state.darkCircle],
    ['complexion', state.complexion],
    ['barrier', state.barrier],
  ];
  return entries.map(([key, metric]) => ({
    key,
    label: SKIN_METRIC_LABELS[key],
    today: metric.today,
    diff: metric.diffFromYesterday,
  }));
}

/**
 * diffFromYesterday 폴백 규칙: null("비교 불가")과 0("어제와 동일")은 서로 다른 상태이니 같은
 * 문구로 뭉개지 않는다. 지표별로 값이 클수록 좋은지 나쁜지가 다 달라 임의로 좋다/나쁘다 색을
 * 매기지 않고, 방향(▲/▼)만 중립색으로 보여준다.
 */
function formatDiffFromYesterday(diff: number | null): { text: string; color: string } {
  if (diff === null) return { text: '전날 비교 불가', color: UNAVAILABLE_METRIC_COLOR };
  if (diff === 0) return { text: '어제와 동일', color: UNAVAILABLE_METRIC_COLOR };
  return { text: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}`, color: '#1A1A1A' };
}

function SleepTimelineBar({ segments }: { segments: SleepTimelineSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0);

  return (
    <View style={styles.timelineBarWrap}>
      <View style={styles.timelineBar}>
        {segments.map((segment) => (
          <View
            key={segment.key}
            style={[
              styles.timelineSegment,
              { flex: segment.minutes / total, backgroundColor: STAGE_COLORS[segment.stage] },
            ]}
          />
        ))}
      </View>
      {/* 각성(node 350:786/787) 발생 시점 마커 — 바 위 절대 좌표(x159/x253, 바 기준 36.3%/64.3%)를
          비율로 환산해 얹었다. "각성 2회" 범례와 개수가 일치한다. */}
      {AROUSAL_MARKER_POSITIONS.map((leftPercent, index) => (
        <View key={index} style={[styles.arousalMarker, { left: `${leftPercent}%` }]} />
      ))}
    </View>
  );
}

function SkinMetricRow({
  label,
  today,
  diff,
}: {
  label: string;
  today: number | null;
  diff: number | null;
}) {
  const diffLabel = formatDiffFromYesterday(diff);
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricHeader}>
        <ThemedText style={styles.metricLabel}>{label}</ThemedText>
        <ThemedText style={styles.metricValue}>
          {today === null ? '측정 불가' : today}{' '}
          <ThemedText style={[styles.metricDelta, { color: diffLabel.color }]}>{diffLabel.text}</ThemedText>
        </ThemedText>
      </View>
      <View style={styles.metricTrack}>
        <View
          style={[
            styles.metricFill,
            {
              width: `${today === null ? 0 : Math.min(100, today)}%`,
              backgroundColor: today === null ? UNAVAILABLE_METRIC_COLOR : '#031949',
            },
          ]}
        />
      </View>
    </View>
  );
}

export function DailyReport({ nickname }: { nickname: string | null }) {
  const [sleepSummaryState, setSleepSummaryState] = useState<SleepSummaryState>({ status: 'loading' });
  const [skinForecastState, setSkinForecastState] = useState<SkinForecastState>({ status: 'loading' });
  const [sleepWindowState, setSleepWindowState] = useState<SleepWindowState>({ status: 'loading' });
  // SleepScoreGamificationModal 트리거 상태(위 SleepScoreCompareState 주석 참고).
  const [sleepScoreCompareState, setSleepScoreCompareState] = useState<SleepScoreCompareState>({
    status: 'loading',
  });

  useEffect(() => {
    const baseDate = getTodayDateString();

    getDailyReport(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        // sleepSummary/skinForecast는 완전히 독립된 섹션 — 같은 응답에서 나왔더라도 각자 다른
        // status를 가질 수 있으므로 반드시 따로 분기해서 두 state에 나눠 담는다.
        setSleepSummaryState(
          data.sleepSummary.status === 'AVAILABLE'
            ? { status: 'available', summary: data.sleepSummary.summary }
            : { status: 'no_data', message: data.sleepSummary.message }
        );
        setSkinForecastState(
          data.skinForecast.status === 'AVAILABLE'
            ? {
                status: 'available',
                darkCircle: data.skinForecast.darkCircle,
                complexion: data.skinForecast.complexion,
                barrier: data.skinForecast.barrier,
              }
            : { status: 'no_data', message: data.skinForecast.message }
        );
      })
      .catch(() => {
        setSleepSummaryState({ status: 'error' });
        setSkinForecastState({ status: 'error' });
      });

    // GET /report/daily/timeline — 별개 엔드포인트라 위 getDailyReport와 독립적으로 호출한다
    // (sleep-detail-modal.tsx와 같은 API, 같은 baseDate).
    getDailyTimeline(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        setSleepWindowState(
          data.status === 'AVAILABLE'
            ? { status: 'available', sleepOnsetTime: data.sleepOnsetTime, wakeTime: data.wakeTime }
            : { status: 'no_data' }
        );
      })
      .catch(() => setSleepWindowState({ status: 'error' }));

    // GET /report/weekly — SleepScoreGamificationModal 트리거용으로 dailyScores에서 오늘·어제
    // 점수만 뽑아 비교한다(weekly-report.tsx와 같은 API, 별도 독립 호출). periodEnd가 baseDate와
    // 같으므로 배열의 마지막 항목이 오늘, 그 앞이 어제다 — 둘 다 값이 있고 오늘이 더 높을 때만
    // 'increased'로 전환한다(신규 가입자의 INSUFFICIENT_DATA나 결측치는 그냥 비교 불가로 처리).
    getWeeklyReport(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        if (data.status !== 'FULL') {
          setSleepScoreCompareState({ status: 'ready' });
          return;
        }
        const { dailyScores } = data;
        const today = dailyScores[dailyScores.length - 1];
        const yesterday = dailyScores[dailyScores.length - 2];
        if (
          !today ||
          !yesterday ||
          today.date !== baseDate ||
          today.sleepScore === null ||
          yesterday.sleepScore === null ||
          today.sleepScore <= yesterday.sleepScore
        ) {
          setSleepScoreCompareState({ status: 'ready' });
          return;
        }
        setSleepScoreCompareState({
          status: 'increased',
          score: today.sleepScore,
          dateLabel: formatSleepScoreDateLabel(today.date),
        });
      })
      .catch(() => setSleepScoreCompareState({ status: 'ready' }));
  }, []);

  const sleepWindow = sleepWindowState.status === 'available' ? sleepWindowState : null;
  const hybridSleepStats =
    sleepSummaryState.status === 'available' ? toHybridSleepStats(sleepSummaryState.summary, sleepWindow) : null;

  return (
    <View style={styles.container}>
      {sleepScoreCompareState.status === 'increased' && (
        <SleepScoreGamificationModal
          score={sleepScoreCompareState.score}
          expGained={SLEEP_SCORE_EXP_MOCK}
          dateLabel={sleepScoreCompareState.dateLabel}
          onClose={() => setSleepScoreCompareState({ status: 'ready' })}
        />
      )}

      <ThemedText style={styles.dateRange}>{DATE_RANGE_LABEL}</ThemedText>
      <ThemedText style={styles.heading}>{buildUserHeading(nickname)}</ThemedText>

      <View style={styles.sleepCard}>
        <View style={styles.sleepCardTitleRow}>
          <Image
            source={require('@/assets/images/figma-icon-report-crescent-moon.png')}
            style={styles.moonIcon}
            contentFit="contain"
          />
          <ThemedText style={styles.sleepCardTitle}>지난밤 수면 구간</ThemedText>
        </View>

        {sleepSummaryState.status === 'loading' && (
          <ThemedText style={styles.statusText}>불러오는 중...</ThemedText>
        )}
        {sleepSummaryState.status === 'error' && (
          <ThemedText style={styles.statusText}>수면 요약을 불러오지 못했어요</ThemedText>
        )}
        {sleepSummaryState.status === 'no_data' && (
          <ThemedText style={styles.statusText}>
            {sleepSummaryState.message ?? '그날의 수면 데이터가 없어요'}
          </ThemedText>
        )}

        {sleepSummaryState.status === 'available' && hybridSleepStats && (
          <>
            {/* 예보 점수(가중평균)와 다른 "그날 수면 부분점수 단순평균" — report/daily.sleepScore
                실값. 다른 화면의 적중률/예보 점수와 절대 혼동하지 말 것(api/report.ts 주석 참고). */}
            <ThemedText style={styles.sleepScoreBadge}>오늘 수면 점수 {sleepSummaryState.summary.sleepScore}점</ThemedText>

            <ThemedText style={styles.sleepWindow}>
              {formatTimeKST(hybridSleepStats.sleepOnsetTime)} – {formatTimeKST(hybridSleepStats.wakeTime)}
            </ThemedText>

            <SleepTimelineBar segments={buildTimelineSegments(hybridSleepStats)} />

            <View style={styles.legendList}>
              {buildLegendRows(hybridSleepStats).map((row, rowIndex) => (
                <View key={rowIndex} style={styles.legendRow}>
                  {row.map((item) => (
                    <View key={item.key} style={styles.legendItem}>
                      {item.icon === 'ring' ? (
                        <View style={[styles.legendRing, { borderColor: item.color }]} />
                      ) : (
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      )}
                      <ThemedText
                        style={[styles.legendText, { color: item.color }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.5}>
                        {item.label}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {sleepSummaryState.status === 'available' && hybridSleepStats && (
        <View style={styles.statGrid}>
          {buildStatItems(hybridSleepStats, sleepSummaryState.summary.sleepScore).map((item) => (
            <View key={item.key} style={styles.statCard}>
              <ThemedText style={styles.statLabel}>{item.label}</ThemedText>
              <ThemedText style={styles.statValue}>{item.value}</ThemedText>
            </View>
          ))}
        </View>
      )}

      <View style={styles.forecastSection}>
        <ThemedText style={styles.forecastTitle}>오늘의 피부 예보</ThemedText>
        <View style={styles.metricList}>
          {skinForecastState.status === 'loading' && (
            <ThemedText style={styles.statusText}>불러오는 중...</ThemedText>
          )}
          {skinForecastState.status === 'error' && (
            <ThemedText style={styles.statusText}>피부 예보를 불러오지 못했어요</ThemedText>
          )}
          {skinForecastState.status === 'no_data' && (
            <ThemedText style={styles.statusText}>
              {skinForecastState.message ?? '그날의 피부 예보가 없어요'}
            </ThemedText>
          )}
          {skinForecastState.status === 'available' &&
            buildSkinReportRows(skinForecastState).map((row) => (
              <SkinMetricRow key={row.key} label={row.label} today={row.today} diff={row.diff} />
            ))}
        </View>
      </View>
    </View>
  );
}

// ThemedText는 type을 안 주면 기본 lineHeight:24를 깔고 들어가므로, 아래 텍스트 스타일은 실제
// 줄 수만큼 높이가 쌓이도록 전부 fontSize에 맞는 lineHeight를 명시했다(안 그러면 각 텍스트가
// 실제 필요한 높이보다 커져서 스크롤 영역 전체가 불필요하게 늘어난다).
const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },

  // "최근 7일 · 7/25 – 7/31" (node 350:789)
  dateRange: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // "test1님의 어제" (node 350:788, y128 — dateRange 하단(y97+20=117) 대비 11) — Figma가 준
  // lineHeight(20)는 fontSize(24)보다 작아 그대로 쓰면 글자가 잘려서, 잘리지 않는 값으로만 보정했다.
  heading: {
    marginTop: 11,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // "지난밤 수면 구간" 카드 (node 350:700, w362 h187, radius16, border Pale Sky 22%, y169 —
  // heading 하단(y128+20=148) 대비 21)
  sleepCard: {
    marginTop: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(112, 115, 124, 0.22)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
  },
  sleepCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moonIcon: {
    width: 19,
    height: 21,
  },
  // node 350:702 — Inter SemiBold 18
  sleepCardTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '600',
    color: '#031949',
  },
  // 로딩/에러/빈 상태 공용 텍스트 — 수면 카드/피부 예보 섹션이 각자 독립적으로 이 스타일을 쓴다.
  statusText: {
    marginTop: 10,
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // "오늘 수면 점수 70점" — report/daily.sleepSummary.summary.sleepScore 실값. Figma 노드 없음,
  // 카드 타이틀과 시간 범위 사이에 보조 배지로 얹는다.
  sleepScoreBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#031949',
    backgroundColor: 'rgba(3, 25, 73, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  // "23:40 – 07:10" (node 350:704) — Inter Bold 11.3, Tuna 69%
  sleepWindow: {
    marginTop: 10,
    fontSize: 11.3,
    lineHeight: 14,
    fontWeight: '700',
    color: 'rgba(55, 56, 60, 0.69)',
  },
  // "stages" 바 (node 350:705, h38, radius6.44, bg #F4F4F4)
  timelineBarWrap: {
    marginTop: 26,
    position: 'relative',
  },
  timelineBar: {
    flexDirection: 'row',
    height: 38,
    borderRadius: 6.44,
    overflow: 'hidden',
    backgroundColor: '#F4F4F4',
  },
  timelineSegment: {
    height: '100%',
  },
  // 각성 마커 (node 350:786/787) — 바 위 5x5 흰 배경 + 빨간 스트로크 원.
  arousalMarker: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 4,
    marginLeft: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#E52222',
    backgroundColor: '#FFFFFF',
  },

  legendList: {
    marginTop: 14,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // 점 표시 (node 350:717 등, 8x8 radius2)
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  // "각성" 항목 전용 링 아이콘 (node 350:735, 흰 배경 + 빨간 스트로크)
  legendRing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  // node 350:719 등 — Inter Medium 12
  legendText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    flexShrink: 1,
  },

  // 지표 카드 6개 (node 350:737~814) — 3열, 배경 투명(fill alpha 0) + 테두리만 있는 카드.
  // sleepCard 하단(y169+187=356) 대비 15, 카드 행간(y457-371=86, 카드 자체 높이≈70) 대비 16.
  statGrid: {
    marginTop: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 16,
  },
  statCard: {
    flexBasis: '31%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(107, 107, 107, 0.21)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  // node style_b5aa5bfb — Inter SemiBold 15, Tuna 61%
  statLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // node "Inter/Bold" 계열 — Cod Gray, ~16
  statValue: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: '#171717',
  },

  // "오늘의 피부 예보" (node 350:742/743, title fontSize20) — statGrid 하단(y457+카드높이≈529)
  // 대비 24.
  forecastSection: {
    marginTop: 24,
  },
  forecastTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#171717',
  },
  // node 350:744 자체 paddingTop(5.78) — 제목 하단 여백(2) 포함해 8.
  metricList: {
    marginTop: 8,
    gap: 14,
  },
  metricRow: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // node style_1c6a76d0 — Inter Bold ~13.5, Cod Gray
  metricLabel: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '700',
    color: '#171717',
  },
  // node "Inter/Bold" ~12, Cod Gray + 델타 색상은 metricDelta에서 덮어씀
  metricValue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#171717',
  },
  metricDelta: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 트랙 (node 350:751 등, h5.78→6, radius2.89→3, Pale Sky 8%) + today%만큼 채워지는 진한 막대.
  metricTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(112, 115, 124, 0.08)',
  },
  metricFill: {
    height: '100%',
    borderRadius: 3,
  },
});
