import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  getMonthlyReport,
  type FullMonthlyReportData,
  type MonthlyReportCorrelation,
  type MonthlyReportCorrelationGroup,
  type MonthlyReportWeek,
} from '@/api/report';
import { ThemedText } from '@/components/themed-text';
import { TEMP_USER_ID } from '@/constants/config';

// 월간 리포트 (REP-07) — Figma 'Ui' 파일(9c7nKnuMLNcGYC33lmX8Im) node 306:2699("리포트- 월간")을
// Dev Mode 값 그대로 옮긴 것. 탭 전환/하단 탭바는 report.tsx/report-ui.tsx/app-tabs.tsx가 소유하는
// 공용 UI라 이 파일에서는 건드리지 않는다(daily/weekly-report.tsx와 동일 원칙 — report-ui.tsx는
// overall-report.tsx가 계속 쓰므로 그대로 둔다).
// 고정 캔버스 절대좌표 대신 Figma 좌표 간격을 padding/gap/marginTop으로 환산해 Flexbox로 짜서
// 기기 폭에 반응형으로 채운다. ThemedText는 type 생략 시 기본 lineHeight:24가 깔리므로 모든
// 텍스트에 fontSize에 맞는 lineHeight를 명시했다(daily-report.tsx에서 겪은 함정과 동일).
//
// GET /api/v1/report/monthly로 실연동한다(api/report.ts). 이 API는 status 하나로 응답 전체를
// 감싼다(FULL | INSUFFICIENT_DATA) — 일간 리포트처럼 섹션별 독립 상태가 아니다.
// 🚨 평균 재계산 금지: weeks[].avgSleepScore 4개를 다시 평균 내 summary를 만들거나, 서버가 준
// isHighest/정렬 순서를 프론트에서 다시 계산하지 않는다 — 전부 서버가 이미 계산해서 준 값 그대로 쓴다.

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

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}분`;
  if (remainder === 0) return `${hours}시간`;
  return `${hours}시간 ${remainder}분`;
}

/** "OOO님의 한달" — nickname은 report.tsx가 GET /api/v1/users/me로 한 번만 불러 내려준다(daily-report.tsx와 동일 패턴). */
function buildUserHeading(nickname: string | null) {
  return nickname ? `${nickname}님의 한달` : '나의 한달';
}

// Figma 차트 플롯 영역 높이(막대 바닥 y202 - 가장 높은 막대 상단 y72 = 130) — 데이터가 아니라 이
// 화면 전용 레이아웃 수치라 응답 객체가 아닌 스타일 상수로 둔다.
const CHART_PLOT_HEIGHT = 130;
// 수면 점수는 0~100 스케일(다른 화면의 예보/수면 점수와 동일 스케일) — 막대 높이 계산용 표시 상수.
const CHART_MAX_VALUE = 100;
// "진한 막대 = 최고 주" — 예전엔 4주 값 순위를 프론트가 매겨 그라데이션을 줬지만, 이제 서버가
// isHighest로 최고 주를 직접 알려주므로 그 값 그대로 이분법(최고/일반)으로 칠한다.
const CHART_BAR_COLOR_HIGHEST = '#031949';
const CHART_BAR_COLOR_NORMAL = '#D6DAE3';
// avgSleepScore가 null(7일 전부 결측)인 주 — 실측 0점과 헷갈리지 않도록 점선 테두리의 빈 막대로 구분.
const CHART_BAR_COLOR_NO_DATA = '#F0F0F2';
const CHART_BAR_BORDER_NO_DATA = '#C7C7C7';

// 상관관계 강도(strength) 표시 메타 — 서버가 내려주는 정확한 값 전체 목록이 확정돼 있지 않아
// (api/report.ts 주석 참고, 현재 "STRONG"만 예시로 확인됨) 알려진 값만 매핑하고, 모르는 값이
// 와도 화면이 깨지지 않도록 원문 문자열 그대로 보여주는 중립색 fallback을 둔다.
const CORRELATION_STRENGTH_META: Record<string, { label: string; color: string; widthPercent: number }> = {
  STRONG: { label: '강함', color: '#FF4242', widthPercent: 85 },
  MODERATE: { label: '보통', color: '#FF9200', widthPercent: 55 },
  WEAK: { label: '약함', color: 'rgba(55, 56, 60, 0.61)', widthPercent: 25 },
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

type MonthlyReportState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'insufficient_data'; periodStart: string; periodEnd: string }
  | { status: 'full'; data: FullMonthlyReportData };

function MonthlyBarChart({ weeks }: { weeks: MonthlyReportWeek[] }) {
  return (
    <View>
      <View style={styles.chartPlot}>
        <View style={styles.barsRow}>
          {weeks.map((week) => {
            const hasScore = week.avgSleepScore !== null;
            const height = hasScore
              ? Math.max(4, (week.avgSleepScore! / CHART_MAX_VALUE) * CHART_PLOT_HEIGHT)
              : 4;
            return (
              <View key={week.weekLabel} style={styles.barColumn}>
                <ThemedText style={styles.barValueLabel}>{hasScore ? week.avgSleepScore : '–'}</ThemedText>
                <View
                  style={[
                    styles.bar,
                    { height },
                    hasScore
                      ? { backgroundColor: week.isHighest ? CHART_BAR_COLOR_HIGHEST : CHART_BAR_COLOR_NORMAL }
                      : styles.barNoData,
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.weekLabelsRow}>
        {weeks.map((week) => (
          <View key={week.weekLabel} style={styles.weekLabelColumn}>
            <ThemedText style={[styles.weekLabel, week.isHighest && styles.weekLabelHighlighted]}>
              {week.weekLabel}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function CorrelationRow({ item }: { item: MonthlyReportCorrelation }) {
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
function CorrelationGroupSection({ group }: { group: MonthlyReportCorrelationGroup }) {
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

export function MonthlyReport({ nickname }: { nickname: string | null }) {
  const [state, setState] = useState<MonthlyReportState>({ status: 'loading' });

  useEffect(() => {
    const baseDate = getTodayDateString();

    getMonthlyReport(baseDate, TEMP_USER_ID)
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
        <ThemedText style={styles.statusText}>월간 리포트를 불러오지 못했어요</ThemedText>
      </View>
    );
  }

  // INSUFFICIENT_DATA — 에러가 아니라 정상 빈 상태(가입 후 28일 미만). 화면이 뻗지 않도록 차트/
  // 상관관계 없이 안내 문구만 보여준다.
  if (state.status === 'insufficient_data') {
    return (
      <View style={styles.container}>
        <ThemedText style={styles.dateRange}>
          최근 28일 · {formatShortDate(state.periodStart)} – {formatShortDate(state.periodEnd)}
        </ThemedText>
        <ThemedText style={styles.heading}>{buildUserHeading(nickname)}</ThemedText>
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyStateText}>가입 후 28일이 지나야 월간 리포트가 제공돼요</ThemedText>
        </View>
      </View>
    );
  }

  const { data } = state;
  const { weeks, summary, correlations } = data;

  // "가장 높은 주"는 서버가 준 isHighest를 그대로 사용(재계산 아님). "가장 낮은 주"는 서버가
  // 별도 플래그를 주지 않아, 이미 계산된 4개 주 평균 중 최솟값을 고르는 것만 프론트가 한다 —
  // 이건 새 평균을 만들어내는 게 아니라 이미 있는 값들 중 하나를 선택하는 것이라 "재계산 금지"
  // 규칙 위반이 아니다.
  const highestWeek = weeks.find((week) => week.isHighest && week.avgSleepScore !== null);
  const weeksWithScore = weeks.filter((week): week is MonthlyReportWeek & { avgSleepScore: number } => week.avgSleepScore !== null);
  const lowestWeek =
    weeksWithScore.length > 0
      ? weeksWithScore.reduce((min, week) => (week.avgSleepScore < min.avgSleepScore ? week : min))
      : null;

  return (
    <View style={styles.container}>
      <ThemedText style={styles.dateRange}>
        최근 28일 · {formatShortDate(data.periodStart)} – {formatShortDate(data.periodEnd)}
      </ThemedText>
      <ThemedText style={styles.heading}>{buildUserHeading(nickname)}</ThemedText>

      {highestWeek && lowestWeek && (
        <View style={styles.insightRow}>
          <ThemedText style={styles.insightLabel}>{'• 가장 높은 주 점수 '}</ThemedText>
          <ThemedText style={styles.insightValue}>{highestWeek.avgSleepScore}</ThemedText>
          <ThemedText style={styles.insightLabel}>{', 낮은 주 점수 '}</ThemedText>
          <ThemedText style={styles.insightValue}>{lowestWeek.avgSleepScore}</ThemedText>
        </View>
      )}

      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <View style={styles.chartTitleRow}>
            <Image
              source={require('@/assets/images/figma-icon-report-crescent-moon.png')}
              style={styles.moonIcon}
              contentFit="contain"
            />
            <ThemedText style={styles.chartTitle}>월간 수면 구간</ThemedText>
          </View>
          <ThemedText style={styles.chartLegend} numberOfLines={1}>
            막대 = 주 평균 · 진한 막대 = 최고 주
          </ThemedText>
        </View>
        <ThemedText style={styles.chartSubRange}>
          {formatDotDate(data.periodStart)} - {formatDotDate(data.periodEnd)}
        </ThemedText>

        <MonthlyBarChart weeks={weeks} />
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
        <ThemedText style={styles.factorSectionTitle}>한 달간 영향이 컸던 요인</ThemedText>
        <View style={styles.factorList}>
          {correlations.length === 0 ? (
            <ThemedText style={styles.statusText}>상관관계 분석 결과가 아직 없어요</ThemedText>
          ) : (
            correlations.map((group) => <CorrelationGroupSection key={group.skinMetric} group={group} />)
          )}
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

  // "최근 28일 · 7/18 – 8/14" (node 306:2702)
  dateRange: {
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '400',
    color: '#9E9E9E',
  },
  // "test1님의 한달" (node 306:2701, y127 — dateRange 하단(y97+20=117) 대비 10)
  heading: {
    marginTop: 10,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // "• 가장 높은 주 점수 70, 낮은 주 점수 50" (node 306:2741) — 배너 박스 없이 빨간 텍스트만,
  // 숫자 2개만 더 크게.
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

  // "월간 수면 구간" 카드 (node 348:1035, w364 h253, radius24, border #CDCDCD) — insight 하단 대비 16.
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
  // node 348:1037 — Pretendard Bold 20, 남색
  chartTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#031949',
  },
  // "막대 = 주 평균 · 진한 막대 = 최고 주" (node 348:1038) — 글자 수가 많아 Figma 원본 크기(10.5)로는
  // 좁은 화면에서 두 줄로 밀린다. 폰트를 줄여 한 줄로 유지한다.
  chartLegend: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'right',
  },
  // "26.07.18 - 26.08.14" (node 348:1039)
  chartSubRange: {
    marginTop: 6,
    fontSize: 13.4,
    lineHeight: 16,
    fontWeight: '500',
    color: '#909090',
  },

  // 막대 플롯 영역 — 막대는 바닥 정렬.
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
    justifyContent: 'flex-end',
  },
  // 막대 위 점수 라벨 — avgSleepScore가 null인 주는 '–'로 방어 표시(daily-report.tsx의
  // "측정 불가" 패턴과 동일한 취지, 막대 위에 얹는 자리라 짧은 기호로 축약).
  barValueLabel: {
    marginBottom: 4,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
    color: '#6B6B6B',
  },
  // 막대 (node 348:1079 등, radius4.77 — 4모서리 모두 동일)
  bar: {
    width: '75%',
    borderRadius: 5,
  },
  // avgSleepScore: null인 주 — 실측 저점(0)과 구분되도록 점선 테두리의 빈 막대로 표시.
  barNoData: {
    backgroundColor: CHART_BAR_COLOR_NO_DATA,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: CHART_BAR_BORDER_NO_DATA,
  },

  weekLabelsRow: {
    marginTop: 12,
    flexDirection: 'row',
  },
  weekLabelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  // node 306:2814~2818 — Noto Sans KR Medium 13, 회색
  weekLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    color: '#9E9E9E',
  },
  // isHighest: true인 주만 Bold + 진한 색
  weekLabelHighlighted: {
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // 지표 카드 2개 (node 306:2742/2747, w176 h84, radius14) — chartCard 하단 대비 11.
  statGrid: {
    marginTop: 11,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: 'rgba(146, 139, 139, 0.21)',
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

  // "한 달간 영향이 컸던 요인" (node 306:2822) — statGrid 하단 대비 12.
  factorSection: {
    marginTop: 12,
  },
  factorSectionTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#171717',
  },
  // node 306:2823 자체 gap(14) — 제목 하단 여백 포함해 14. 이제 그룹 단위(CorrelationGroupSection)로
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
  // node Inter/Bold — 14, Cod Gray
  factorLabel: {
    fontSize: 14,
    lineHeight: 18,
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
  // node Inter/Bold (108:1572) — 12, 강도별 색은 CORRELATION_STRENGTH_META에서 덮어씀
  factorStrength: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
  },
  // 트랙 (node EL-e8a8202d, h6, radius3, Pale Sky 8%) + widthPercent만큼 채워지는 막대.
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
