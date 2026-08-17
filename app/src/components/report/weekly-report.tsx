import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  getWeeklyReport,
  type FullWeeklyReportData,
  type WeeklyReportCorrelation,
  type WeeklyReportCorrelationGroup,
  type WeeklyReportDailyScore,
} from '@/api/report';
import { ThemedText } from '@/components/themed-text';
import { TEMP_USER_ID } from '@/constants/config';

// 주간 리포트 (REP-06) — Figma 'Ui' 파일(9c7nKnuMLNcGYC33lmX8Im) node 306:2268("리포트- 주간")을
// Dev Mode 값 그대로 옮긴 것. 탭 전환 세그먼트(일간/주간/월간/종합)와 하단 탭바는
// report.tsx/report-ui.tsx/app-tabs.tsx가 소유하는 공용 UI라 이 파일에서는 건드리지 않는다
// (daily/monthly-report.tsx와 동일 원칙 — report-ui.tsx는 overall이 계속 쓰므로 그대로 둔다).
// 고정 캔버스 절대좌표 대신 Figma 좌표 간격을 padding/gap/marginTop으로 환산해 Flexbox로 짜서
// 기기 폭에 반응형으로 채운다. ThemedText는 type 생략 시 기본 lineHeight:24가 깔리므로 모든
// 텍스트에 fontSize에 맞는 lineHeight를 명시했다(daily-report.tsx에서 겪은 것과 같은 함정).
//
// GET /api/v1/report/weekly로 실연동한다(api/report.ts). 월간 리포트와 마찬가지로 이 API는
// status 하나로 응답 전체를 감싼다(FULL | INSUFFICIENT_DATA).
// 🚨 신규 사용자(INSUFFICIENT_DATA)와 기존 사용자의 결측치(FULL인데 특정 날짜만 sleepScore: null)는
// 서로 다른 케이스다 — 절대 같은 문구/같은 분기로 섞지 않는다. 평균 재계산도 금지: summary는
// dailyScores로부터 프론트가 다시 평균 내지 않고 API 값 그대로 쓴다.

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM-DD" → "M/D". 형식이 예상과 다르면(방어) 원본 문자열을 그대로 돌려준다. */
function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [, month, day] = parts;
  return `${Number(month)}/${Number(day)}`;
}

/** "YYYY-MM-DD" → "YY.MM.DD". 형식이 예상과 다르면(방어) 원본 문자열을 그대로 돌려준다. */
function formatDotDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${year.slice(2)}.${month}.${day}`;
}

/** "YYYY-MM-DD" → "D"(일자만, 막대 아래 요일 라벨용). 형식이 예상과 다르면(방어) 원본 문자열을 그대로 돌려준다. */
function formatDayOfMonth(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return String(Number(parts[2]));
}

/** "OOO님의 일주일" — nickname은 report.tsx가 GET /api/v1/users/me로 한 번만 불러 내려준다(daily-report.tsx와 동일 패턴). */
function buildUserHeading(nickname: string | null) {
  return nickname ? `${nickname}님의 일주일` : '나의 일주일';
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}분`;
  if (remainder === 0) return `${hours}시간`;
  return `${hours}시간 ${remainder}분`;
}

// Figma 차트 플롯 영역 높이(막대 바닥 y206 - 가장 높은 막대 상단 y52 ≈ 154px) — 데이터가 아니라
// 이 화면 전용 레이아웃 수치라 응답 객체가 아닌 스타일 상수로 둔다.
const CHART_PLOT_HEIGHT = 154;
// 수면 점수는 0~100 스케일 — 막대 높이 계산용 표시 상수(다른 리포트 화면과 동일).
const CHART_MAX_VALUE = 100;
// "목표 수면 점수" 점선 — 이 API에 목표치 개념이 없어(개인 목표 설정 API 미등재) 여전히 목업이다.
// 실제 목표 설정 기능이 생기면 이 상수 대신 그 값을 쓸 것.
const WEEKLY_TARGET_SCORE_MOCK = 75;
// 점선 위 점 색 — Figma가 점마다 남색/검정을 번갈아 썼다(node 348:1017~1023).
const TARGET_DOT_COLORS = ['#031949', '#031949', '#000000', '#000000', '#000000', '#031949', '#031949'];
// sleepScore: null(그날 세션 없음)인 막대 — 실측 0점과 헷갈리지 않도록 점선 테두리의 빈 막대로 구분
// (월간 리포트의 avgSleepScore: null 처리와 동일한 방어).
const BAR_COLOR_NO_DATA = '#F0F0F2';
const BAR_BORDER_NO_DATA = '#C7C7C7';

// 상관관계 강도(strength) 표시 메타 — 서버가 내려주는 정확한 값 전체 목록이 확정돼 있지 않다
// (api/report.ts 주석 참고, 이 엔드포인트는 "VERY_STRONG" 예시가 확인됨 — 월간 리포트의
// "STRONG" 예시와 다른 값이라 두 화면의 실제 등급 종류가 같다고 단정하지 않는다). 알려진 값만
// 매핑하고, 모르는 값이 와도 화면이 깨지지 않도록 원문 문자열 그대로 보여주는 중립색 fallback을 둔다.
const CORRELATION_STRENGTH_META: Record<string, { label: string; color: string; widthPercent: number }> = {
  VERY_STRONG: { color: '#FF4242', label: '매우 강함', widthPercent: 92 },
  STRONG: { color: '#FF9200', label: '강함', widthPercent: 68 },
  MODERATE: { color: '#40A33C', label: '보통', widthPercent: 42 },
  WEAK: { color: 'rgba(55, 56, 60, 0.61)', label: '약함', widthPercent: 20 },
};
const CORRELATION_STRENGTH_FALLBACK_COLOR = '#6B6B6B';
const CORRELATION_STRENGTH_FALLBACK_WIDTH = 40;
const INSUFFICIENT_SAMPLE_COLOR = '#9E9E9E';

// correlations 그룹 헤더 라벨 — 서버가 skinMetric 코드값을 늘릴 수 있어(api/report.ts 참고) 모르는
// 코드가 와도 화면이 깨지지 않도록 원문 코드 그대로 보여주는 fallback을 둔다.
const SKIN_METRIC_GROUP_LABELS: Record<string, string> = {
  DARK_CIRCLE: '다크서클',
  COMPLEXION: '혈색',
  BARRIER: '피부장벽',
};

type WeeklyReportState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'insufficient_data'; periodStart: string; periodEnd: string }
  | { status: 'full'; data: FullWeeklyReportData };

function WeeklyBarChart({ days }: { days: WeeklyReportDailyScore[] }) {
  const targetHeight = (WEEKLY_TARGET_SCORE_MOCK / CHART_MAX_VALUE) * CHART_PLOT_HEIGHT;
  // periodEnd(가장 최근 날짜) = 오늘 — Figma가 항상 마지막(가장 최근) 막대의 요일 라벨만 굵게
  // 강조한 것과 같은 규칙("오늘" 강조), 점수 순위로 매기는 게 아니다.
  const todayDate = days.length > 0 ? days[days.length - 1].date : null;

  return (
    <View>
      <View style={styles.chartPlot}>
        <View style={[styles.targetLine, { bottom: targetHeight }]} />
        <View style={styles.barsRow}>
          {days.map((day) => {
            const hasScore = day.sleepScore !== null;
            const height = hasScore
              ? Math.max(4, (day.sleepScore! / CHART_MAX_VALUE) * CHART_PLOT_HEIGHT)
              : 4;
            return (
              <View key={day.date} style={styles.barColumn}>
                <View style={[styles.bar, { height }, !hasScore && styles.barNoData]} />
              </View>
            );
          })}
        </View>
        <View style={[styles.targetDotsRow, { bottom: targetHeight - 3 }]}>
          {days.map((day, index) => (
            <View key={day.date} style={styles.targetDotColumn}>
              <View style={[styles.targetDot, { backgroundColor: TARGET_DOT_COLORS[index] }]} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.dayLabelsRow}>
        {days.map((day) => (
          <View key={day.date} style={styles.dayLabelColumn}>
            <ThemedText style={[styles.dayLabel, day.date === todayDate && styles.dayLabelHighlighted]}>
              {formatDayOfMonth(day.date)}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function CorrelationRow({ item }: { item: WeeklyReportCorrelation }) {
  // 표본 부족은 strength 값과 무관하게 이 플래그로만 분기한다(규칙: insufficientSample: true면
  // strength는 항상 null이지만, 판단 자체는 항상 insufficientSample로 한다).
  if (item.insufficientSample) {
    return (
      <View style={styles.factorRow}>
        <View style={styles.factorHeader}>
          <ThemedText style={[styles.factorLabel, styles.factorLabelMuted]}>
            {item.featureLabel} → {item.metricLabel}
          </ThemedText>
          <ThemedText style={styles.factorInsufficientText}>데이터 부족 ({item.sampleSize}건)</ThemedText>
        </View>
        <View style={styles.factorTrack} />
      </View>
    );
  }

  const meta = item.strength
    ? (CORRELATION_STRENGTH_META[item.strength] ?? {
        label: item.strength,
        color: CORRELATION_STRENGTH_FALLBACK_COLOR,
        widthPercent: CORRELATION_STRENGTH_FALLBACK_WIDTH,
      })
    : null;

  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHeader}>
        <ThemedText style={styles.factorLabel}>
          {item.featureLabel} → {item.metricLabel}
        </ThemedText>
        {meta && <ThemedText style={[styles.factorStrength, { color: meta.color }]}>{meta.label}</ThemedText>}
      </View>
      <View style={styles.factorTrack}>
        {meta && <View style={[styles.factorFill, { width: `${meta.widthPercent}%`, backgroundColor: meta.color }]} />}
      </View>
    </View>
  );
}

// correlations가 flat 배열에서 skinMetric 기준 3그룹으로 바뀐 뒤의 렌더링 단위 — 그룹 헤더 아래
// 그 그룹에 속한 CorrelationRow들을 나열한다. 매핑되는 sleepFeature가 없어 그룹이 비어있을 수도
// 있다는 게 명세로 확정돼 있어(api/report.ts 참고), 그 경우도 화면이 비어 보이지 않게 방어한다.
function CorrelationGroupSection({ group }: { group: WeeklyReportCorrelationGroup }) {
  const groupLabel = SKIN_METRIC_GROUP_LABELS[group.skinMetric] ?? group.skinMetric;
  return (
    <View style={styles.correlationGroup}>
      <ThemedText style={styles.correlationGroupTitle}>{groupLabel}</ThemedText>
      {group.correlations.length === 0 ? (
        <ThemedText style={styles.statusText}>관련 데이터가 아직 없어요</ThemedText>
      ) : (
        group.correlations.map((item) => (
          <CorrelationRow key={`${item.sleepFeature}-${item.skinMetric}`} item={item} />
        ))
      )}
    </View>
  );
}

export function WeeklyReport({ nickname }: { nickname: string | null }) {
  const [state, setState] = useState<WeeklyReportState>({ status: 'loading' });

  useEffect(() => {
    const baseDate = getTodayDateString();

    getWeeklyReport(baseDate, TEMP_USER_ID)
      .then(({ data }) => {
        setState(
          data.status === 'FULL'
            ? { status: 'full', data }
            : { status: 'insufficient_data', periodStart: data.periodStart, periodEnd: data.periodEnd }
        );
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  if (state.status === 'loading') {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.statusText}>불러오는 중...</ThemedText>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.statusText}>주간 리포트를 불러오지 못했어요</ThemedText>
      </View>
    );
  }

  // INSUFFICIENT_DATA — 신규 사용자(가입 후 7일 미만) 전용 빈 상태. 에러가 아니므로 화면이 뻗지
  // 않도록 차트/상관관계 없이 안내 문구만 보여준다. FULL인데 특정 날짜만 결측인 경우는 이 분기를
  // 타지 않는다(아래 'full' 분기에서 날짜별로 개별 방어).
  if (state.status === 'insufficient_data') {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.dateRange}>
          최근 7일 · {formatShortDate(state.periodStart)} – {formatShortDate(state.periodEnd)}
        </ThemedText>
        <ThemedText style={styles.heading}>{buildUserHeading(nickname)}</ThemedText>
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>가입 후 7일이 지나야 주간 리포트가 제공돼요</ThemedText>
        </View>
      </View>
    );
  }

  const { data } = state;
  const { dailyScores, summary, correlations } = data;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.dateRange}>
        최근 7일 · {formatShortDate(data.periodStart)} – {formatShortDate(data.periodEnd)}
      </ThemedText>
      <ThemedText style={styles.heading}>test1님의 일주일</ThemedText>

      <View style={styles.insightRow}>
        <ThemedText style={styles.insightLabel}>{'• 이번 주 평균 수면 점수 '}</ThemedText>
        <ThemedText style={styles.insightValue}>
          {summary.avgSleepScore === null ? '측정 불가' : summary.avgSleepScore}
        </ThemedText>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <View style={styles.chartTitleRow}>
            <Image
              source={require('@/assets/images/figma-icon-report-crescent-moon.png')}
              style={styles.moonIcon}
              contentFit="contain"
            />
            <ThemedText style={styles.chartTitle}>주간 수면 구간</ThemedText>
          </View>
          <ThemedText style={styles.chartLegend}>막대= 수면/ 점선= 목표</ThemedText>
        </View>
        <ThemedText style={styles.chartSubRange}>
          {formatDotDate(data.periodStart)} - {formatDotDate(data.periodEnd)}
        </ThemedText>

        <WeeklyBarChart days={dailyScores} />
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statLabel}>평균 수면 점수</ThemedText>
          <ThemedText style={styles.statValue}>
            {summary.avgSleepScore === null ? '측정 불가' : `${summary.avgSleepScore}점`}
          </ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statLabel}>평균 깊은수면</ThemedText>
          <ThemedText style={styles.statValue}>
            {summary.avgDeepSleepMinutes === null ? '측정 불가' : formatDuration(summary.avgDeepSleepMinutes)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.factorSection}>
        <ThemedText style={styles.factorSectionTitle}>한 주간 영향이 컸던 요인</ThemedText>
        <View style={styles.factorList}>
          {correlations.map((group) => (
            <CorrelationGroupSection key={group.skinMetric} group={group} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },

  statusText: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },

  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyStateText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    color: 'rgba(55, 56, 60, 0.61)',
  },

  // "최근 7일 · 7/25 – 7/31" (node 306:2385)
  dateRange: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // "test1님의 일주일" (node 306:2384, y127 — dateRange 하단(y97+20=117) 대비 10)
  heading: {
    marginTop: 10,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // "• 이번 주 평균 수면 점수 70" (node 306:2428/348:1033) — 배너 박스 없이 빨간 텍스트만.
  // 원래 Figma 문구는 "저번주 대비 +N"이었지만 이 API가 저번 주 값을 내려주지 않아(별도 API
  // 호출 없이는 재계산 없이 만들 수 없는 값) 이번 주 평균으로 대체했다.
  insightRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  insightLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    color: '#E52222',
  },
  insightValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#E52222',
  },

  // "주간 수면 구간" 카드 (node 348:935, w358 h253, radius24, border #CDCDCD) — insight 하단 대비 16.
  chartCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CDCDCD',
    borderRadius: 24,
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 20,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  moonIcon: {
    width: 19,
    height: 21,
  },
  // node 348:936 — Pretendard Bold 20, 남색
  chartTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#031949',
  },
  // "막대= 수면/ 점선= 목표" (node 348:939)
  chartLegend: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '400',
    color: '#9C9C9C',
  },
  // "26.08.08 - 26.08.14" (node 348:940)
  chartSubRange: {
    marginTop: 6,
    fontSize: 13.4,
    lineHeight: 16,
    fontWeight: '500',
    color: '#909090',
  },

  // 막대 플롯 영역 — 막대는 바닥 정렬, 목표선/점은 절대 좌표로 얹는다.
  chartPlot: {
    marginTop: 18,
    height: CHART_PLOT_HEIGHT,
    position: 'relative',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: '100%',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // 막대 (node 348:993 등, fill #D1D9E9, radius6.79 — 4모서리 모두 동일하게 둥글다)
  bar: {
    width: '82%',
    borderRadius: 7,
    backgroundColor: '#D1D9E9',
  },
  // sleepScore: null(그날 세션 없음)인 날 — 실측 저점(0)과 구분되도록 점선 테두리의 빈 막대로 표시.
  barNoData: {
    backgroundColor: BAR_COLOR_NO_DATA,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BAR_BORDER_NO_DATA,
  },
  // 목표선 (점선) — node 348:1024~1029 스트로크를 하나의 가로 점선으로 옮겼다.
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#031949',
  },
  targetDotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  targetDotColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // 목표선 점 (node 348:1017~1023, 3x3 원)
  targetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  dayLabelsRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  dayLabelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // node 348:1009~1014 — Noto Sans KR Medium 12, 회색
  dayLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    color: '#9E9E9E',
  },
  // periodEnd(오늘)만 Bold + 진한 색
  dayLabelHighlighted: {
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // 지표 카드 2개 (node 306:2439/2444, w176 h87, radius14) — chartCard 하단 대비 12.
  statGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(107, 107, 107, 0.21)',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  // node style_b5aa5bfb — Inter SemiBold 15, Tuna 61%
  statLabel: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // node style_22ee3cf1 — Inter Bold 22, Cod Gray
  statValue: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    color: '#171717',
  },

  // "한 주간 영향이 컸던 요인" (node 306:2449) — statGrid 하단 대비 12.
  factorSection: {
    marginTop: 12,
  },
  factorSectionTitle: {
    fontSize: 16.6,
    lineHeight: 21,
    fontWeight: '700',
    color: '#171717',
  },
  // node 306:2450 자체 gap(13.68) — 제목 하단 여백 포함해 14. 이제 그룹 단위(CorrelationGroupSection)로
  // 나열되므로 이 gap은 그룹 사이 간격이다.
  factorList: {
    marginTop: 14,
    gap: 18,
  },
  // 그룹 헤더(다크서클/혈색/피부장벽) + 그 안의 CorrelationRow들 — Figma엔 없는 신규 구조라
  // factorSectionTitle보다 한 단계 작은 보조 타이틀로 얹었다.
  correlationGroup: {
    gap: 10,
  },
  correlationGroupTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    color: '#031949',
  },
  factorRow: {
    gap: 6,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // node style_92ec3dff — Inter Bold ~13.68, Cod Gray
  factorLabel: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: '700',
    color: '#171717',
  },
  // 표본 부족(insufficientSample: true) 행 — 라벨 자체도 흐리게 눌러 "이 조합은 아직 근거가
  // 약하다"는 걸 색만으로도 알 수 있게 한다.
  factorLabelMuted: {
    color: INSUFFICIENT_SAMPLE_COLOR,
  },
  factorInsufficientText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: INSUFFICIENT_SAMPLE_COLOR,
  },
  // node style_6e2192a5 — Inter Bold ~11.72, 강도별 색은 CORRELATION_STRENGTH_META에서 덮어씀
  factorStrength: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 트랙 (node 348:ea96261c 계열, h5.86→6, radius2.93→3, Pale Sky 8%) + widthPercent만큼 채워지는 막대.
  factorTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(112, 115, 124, 0.08)',
  },
  factorFill: {
    height: '100%',
    borderRadius: 3,
  },
});
