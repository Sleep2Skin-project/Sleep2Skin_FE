import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import {
  getOverallReport,
  type OverallReportClinicNeeded,
  type OverallReportData,
  type OverallReportTrendMetric,
  type OverallReportTrends,
} from '@/api/report';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';

// 종합 리포트 (REP-09~11) — Figma 'Ui' 파일(9c7nKnuMLNcGYC33lmX8Im) node 306:2856("리포트- 종합")을
// Dev Mode 값 그대로 옮긴 것. 탭 전환/하단 탭바/배경색은 report.tsx/report-ui.tsx/app-tabs.tsx가
// 소유하는 공용 UI라 이 파일에서는 건드리지 않는다(daily/weekly/monthly-report.tsx와 동일 원칙).
//
// GET /api/v1/report/overall로 실연동한다(api/report.ts). 예전엔 triage.triggered 발동 조건을
// 만족할 때만("수면 추세 STABLE/RISING + 정체 지표 있음") 판단 근거를 보여줬는데, 그 게이팅이
// 서버에서 완전히 없어졌다 — 이제 status가 FULL이면 다크서클/혈색/장벽 3개 지표의 3주 추세가
// 항상 다 나온다. 서버는 문장을 만들지 않고 판정값(trend/volatileDirection/w1·w3 평균)만
// 내려주므로, 판단 근거 카드의 문구는 전부 이 화면에서 판정값을 보고 직접 구성한다.
// - status: INSUFFICIENT_DATA(가입 21일 미만) → 판단 자체가 불가능하니 기록을 유도하는 안내
//   배너로 상단을 덮는다(RecordPromptBanner, 서버 message 우선 사용).
// - FULL이면 "수면으로는 잡히지 않는 신호가 있어요" 파란 히어로(SleepSignalHero)와 그 아래
//   3개 지표 추세를 나열하는 판단 근거 카드(ReasonCard)를 항상 함께 띄운다.
// "Sleep2Skin이 돕는 것"(appManaged)·"클리닉이 필요한 것"(clinicNeeded) 카드와 CTA 버튼은 위
// 상태와 무관하게 항상 렌더링한다 — clinicNeeded는 trends와 별개로 최근 셀피 검증에서 실제로
// 감지된 신호이고, CTA는 기획상 항상 노출하기로 확정됐다.

const CTA_LABEL = '엠레드 클리닉 상담 알아보기';
const DISCLAIMER = '의료 진단이 아닙니다. 기록 패턴에 기반한 참고 신호입니다.';

// appManaged 코드값 라벨 — weekly/monthly-report.tsx의 SKIN_METRIC_GROUP_LABELS와 같은 코드값
// 집합이다(서버가 늘릴 수 있어 모르는 코드가 와도 원문 그대로 보여주는 fallback을 둔다).
const SKIN_METRIC_LABELS: Record<string, string> = {
  DARK_CIRCLE: '다크서클',
  COMPLEXION: '혈색',
  BARRIER: '피부장벽',
};

// "Sleep2Skin이 돕는 것" 카드(아래 ScopeCard) 전용 라벨 — 다크서클 항목만 "다크서클 회복"으로
// 표시한다. SKIN_METRIC_LABELS를 직접 바꾸면 3주 추세 섹션(TREND_METRIC_ORDER, 아래)까지 같이
// 바뀌어버려서 별도로 뺐다.
const APP_MANAGED_METRIC_LABELS: Record<string, string> = {
  ...SKIN_METRIC_LABELS,
  DARK_CIRCLE: '다크서클 회복',
};

// trends는 항상 이 3개 키 고정(서버가 늘릴 계획 없음) — SKIN_METRIC_LABELS와 같은 라벨을 쓴다.
const TREND_METRIC_ORDER: { key: keyof OverallReportTrends; label: string }[] = [
  { key: 'darkCircle', label: SKIN_METRIC_LABELS.DARK_CIRCLE },
  { key: 'complexion', label: SKIN_METRIC_LABELS.COMPLEXION },
  { key: 'barrier', label: SKIN_METRIC_LABELS.BARRIER },
];

// clinicNeeded 감지 플래그 3종의 라벨 — true인 항목만 골라 보여준다(false/null은 목록에서
// 그냥 빠진다, "감지 안 됨"과 "측정한 적 없음"을 문구로 따로 구분하지 않아도 되는 이유는 아래
// ClinicScopeCard 참고).
const CLINIC_SIGNAL_LABELS: Record<keyof OverallReportClinicNeeded, string> = {
  pigmentationDetected: '색소침착',
  acneScarDetected: '여드름 흉터',
  agingDetected: '구조적 노화',
};

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 서버는 trend/volatileDirection 판정값만 주고 문장은 만들지 않으므로, 화면에서 직접 구성한다.
// w1/w3 평균이 둘 다 있으면 참고용 숫자를 괄호로 덧붙인다(둘 중 하나라도 없으면 생략).
function buildTrendDetail(metric: OverallReportTrendMetric): string {
  let sentence: string;
  switch (metric.trend) {
    case 'IMPROVED':
      sentence = '3주간 좋아지고 있어요';
      break;
    case 'WORSENED':
      sentence = '3주간 나빠지고 있어요';
      break;
    case 'MAINTAINED':
      sentence = '3주간 비슷하게 유지되고 있어요';
      break;
    case 'VOLATILE':
      sentence =
        metric.volatileDirection === 'FALL_THEN_RISE'
          ? '낮아졌다가 다시 회복됐어요'
          : '상승했다가 다시 낮아졌어요';
      break;
    case 'INSUFFICIENT_SAMPLE':
      sentence = '아직 판단하기엔 기록이 부족해요';
      break;
  }

  if (metric.w1Average !== null && metric.w3Average !== null) {
    return `${sentence} (${metric.w1Average} → ${metric.w3Average})`;
  }
  return sentence;
}

type OverallReportState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: OverallReportData };

function ReasonRow({ title, detail, achieved }: { title: string; detail: string; achieved: boolean }) {
  return (
    <View style={styles.reasonRow}>
      <View style={[styles.reasonDot, !achieved && styles.reasonDotUnachieved]} />
      <View style={styles.reasonTextBlock}>
        <ThemedText style={styles.reasonTitle}>{title}</ThemedText>
        <ThemedText style={styles.reasonDetail}>{detail}</ThemedText>
      </View>
    </View>
  );
}

// "수면으로는 잡히지 않는 신호가 있어요" 파란 히어로 — triage.triggered와 무관하게 status가
// FULL이면 항상 독립적으로 뜬다(기획 확인 완료). 아래 이어지는 판단 근거 카드(ReasonCard)와
// 더 이상 세트로 묶여 있지 않다.
function SleepSignalHero() {
  return (
    <View style={styles.hero}>
      <View style={styles.pill}>
        <ThemedText style={styles.pillText}>3주 관찰 결과</ThemedText>
      </View>
      <ThemedText style={styles.heroHeading}>수면으로는 잡히지 않는 신호가 있어요</ThemedText>
      <ThemedText style={styles.heroSubtext}>생활 습관이 아니라 다른 접근이 필요한 영역일 수 있습니다.</ThemedText>
    </View>
  );
}

// status: FULL — 다크서클/혈색/장벽 3개 지표의 3주 추세를 항상 전부 나열한다(더 이상 triage
// 발동 여부에 따라 갈리지 않는다). achieved(채워진 점)는 IMPROVED일 때만 — 나머지 4개 trend
// 값(WORSENED/MAINTAINED/VOLATILE/INSUFFICIENT_SAMPLE)은 전부 "좋아지고 있다고 말할 수 없음"으로
// 묶어 빈 점으로 표시한다.
function ReasonCard({ trends }: { trends: OverallReportTrends }) {
  return (
    <View style={styles.reasonCard}>
      <ThemedText style={styles.reasonCardTitle}>이렇게 판단했어요</ThemedText>
      {TREND_METRIC_ORDER.map(({ key, label }) => {
        const metric = trends[key];
        return (
          <ReasonRow
            key={key}
            title={`${label} 추세`}
            detail={buildTrendDetail(metric)}
            achieved={metric.trend === 'IMPROVED'}
          />
        );
      })}
    </View>
  );
}

// status: INSUFFICIENT_DATA — 가입 21일 미만이라 판단 자체가 불가능한 상태. 서버가 내려주는
// message를 우선 쓰고, 없으면(방어적으로) 기존 안내 문구로 대체한다.
function RecordPromptBanner({ message }: { message: string | null }) {
  return (
    <View style={styles.recordPrompt}>
      <ThemedText style={styles.recordPromptHeading}>
        {message ?? '정확한 종합 분석을 위해 수면 기록이 조금 더 필요해요!'}
      </ThemedText>
      <ThemedText style={styles.recordPromptSubtext}>매일 꾸준히 기록을 남겨주세요.</ThemedText>
    </View>
  );
}

function ScopeCard({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.scopeCard}>
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

// clinicNeeded는 trends와 무관하게 항상 독립적으로 보여준다(기획 확인 완료) — 최근 셀피 검증에서
// 실제로 감지된 신호라 수면 추세 판정과는 별개다. null 3갈래를 전부 방어한다:
// - clinicNeeded 전체가 null(셀피 인증 이력 자체 없음) → 안내 문구
// - 개별 필드만 null(그 컬럼 도입 이전 실측 행) → 그 항목만 조용히 목록에서 빠짐(true 목록만 추려서
//   보여주므로 null/false를 구분해서 별도 표시할 필요가 없다)
// - 전부 false/null(감지된 게 없음) → "감지된 항목이 없어요" 안내
function ClinicScopeCard({ clinicNeeded }: { clinicNeeded: OverallReportClinicNeeded | null }) {
  if (clinicNeeded === null) {
    return (
      <View style={[styles.scopeCard, styles.scopeCardClinic]}>
        <ThemedText style={styles.scopeTitle}>클리닉이 필요한 것</ThemedText>
        <ThemedText style={styles.scopeEmptyText}>아직 셀피 인증 이력이 없어요</ThemedText>
      </View>
    );
  }

  const detectedLabels = (Object.keys(CLINIC_SIGNAL_LABELS) as (keyof OverallReportClinicNeeded)[])
    .filter((key) => clinicNeeded[key] === true)
    .map((key) => CLINIC_SIGNAL_LABELS[key]);

  return (
    <View style={[styles.scopeCard, styles.scopeCardClinic]}>
      <ThemedText style={styles.scopeTitle}>클리닉이 필요한 것</ThemedText>
      {detectedLabels.length === 0 ? (
        <ThemedText style={styles.scopeEmptyText}>감지된 항목이 없어요</ThemedText>
      ) : (
        <View style={styles.scopeList}>
          {detectedLabels.map((label) => (
            <ThemedText key={label} style={styles.scopeItem}>
              · {label}
            </ThemedText>
          ))}
        </View>
      )}
    </View>
  );
}

export function OverallReport() {
  const [state, setState] = useState<OverallReportState>({ status: 'loading' });

  useEffect(() => {
    getOverallReport(getTodayDateString(), TEMP_USER_ID)
      .then(({ data }) => setState({ status: 'ready', data }))
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
        <ThemedText style={styles.statusText}>종합 리포트를 불러오지 못했어요</ThemedText>
      </View>
    );
  }

  const { data } = state;

  const handleCtaPress = () => {
    // REP-11: 엠레드 클리닉 상담 페이지로 이동. Linking.openURL은 웹에서는 새 탭으로,
    // 네이티브에서는 외부 브라우저/앱으로 열어 플랫폼별 분기 없이 동작한다.
    Linking.openURL(data.clinicLink).catch((error) => {
      console.warn('Failed to open clinic link', error);
    });
  };

  return (
    <View style={styles.container}>
      {data.status === 'INSUFFICIENT_DATA' ? (
        <RecordPromptBanner message={data.message} />
      ) : (
        <>
          <SleepSignalHero />
          <ReasonCard trends={data.trends} />
        </>
      )}

      <View style={styles.scopeRow}>
        <ScopeCard
          title="Sleep2Skin이 돕는 것"
          items={data.appManaged.map((code) => APP_MANAGED_METRIC_LABELS[code] ?? code)}
        />
        <ClinicScopeCard clinicNeeded={data.clinicNeeded} />
      </View>

      {/* node 306:2987 "spacer" — 카드가 화면보다 짧을 때 CTA를 화면 하단에 붙인다. 카드가 길어
          스크롤이 필요해지면 flex:1이 0으로 수렴해 자연스럽게 원래 흐름대로 쌓인다. */}
      <View style={styles.spacer} />

      <Pressable onPress={handleCtaPress} style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}>
        <ThemedText style={styles.ctaText}>{CTA_LABEL}</ThemedText>
      </Pressable>

      <ThemedText style={styles.disclaimer}>{DISCLAIMER}</ThemedText>
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
  // 로딩/에러 상태 텍스트 — Figma 노드 없음, 다른 리포트 탭과 동일한 패턴.
  statusText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },

  // "수면으로는 잡히지 않는 신호가 있어요" 히어로 (node 306:2953, padding16, gap8, radius14, fill #031949)
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
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '500',
    color: Colors.white,
  },
  // "수면으로는 잡히지 않는 신호가 있어요" (node 306:2956) — Pretendard SemiBold 20, lineHeight 1.4em
  heroHeading: {
    fontSize: 21.5,
    lineHeight: 30,
    fontWeight: '600',
    color: Colors.white,
  },
  // node 306:2957 — fontSize12, lineHeight 1.55em, opacity 0.75
  heroSubtext: {
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.75)',
  },

  // status: INSUFFICIENT_DATA 전용 — Figma 노드 없음. 경고도 축하도 아닌 중립 안내라 판단 근거
  // 카드와 같은 톤(흰 배경 + 연회색 테두리)을 쓴다.
  recordPrompt: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#DCDCDC',
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  recordPromptHeading: {
    fontSize: 16.5,
    lineHeight: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  recordPromptSubtext: {
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: '400',
    color: 'rgba(55, 56, 60, 0.61)',
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
    fontSize: 16.5,
    lineHeight: 24,
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
  // "변화 없음"(정체 지표) 항목 전용(node 306:2971) — 빈 회색 원 + 테두리
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
    fontSize: 16.5,
    lineHeight: 24,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  // node style_2e329da4 — Regular 11, lineHeight 1.5em
  reasonDetail: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '400',
    color: '#9E9E9E',
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
  // "클리닉이 필요한 것" — 배경이 더 짙은 회색 + 테두리 색만 다르고, 제목 색은 왼쪽 카드와 동일.
  scopeCardClinic: {
    backgroundColor: '#E9E9E9',
    borderColor: 'rgba(0, 0, 0, 0.29)',
  },
  // node style_ef978d32 — Bold 12, lineHeight 1.4em
  scopeTitle: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  scopeList: {
    gap: 2,
  },
  // node style_2e329da4 — Regular 11, lineHeight 1.5em
  scopeItem: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '400',
    color: '#6B6B6B',
  },
  // clinicNeeded 전체 null(이력 없음) / 감지 항목 0개 — Figma 노드 없음, scopeItem과 같은 톤.
  scopeEmptyText: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '400',
    color: '#9E9E9E',
  },

  // CTA 버튼(node 306:2989, height52, radius10, fill #031949) — 트리아지/표본 상태와 무관하게
  // 항상 노출한다(기획 확인 완료).
  ctaButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // node — Medium 15
  ctaText: {
    fontSize: 16.5,
    lineHeight: 20,
    fontWeight: '500',
    color: Colors.white,
  },
  // node 306:2990 — 원본 Regular 10, lineHeight 1.5em, 중앙 정렬 (fontSize는 아래에서 12로 조정됨)
  //
  // 아이폰16 규격 맞추기(1차 재시도) — 버튼+안내 문구 그룹을 48pt(8mm) 위로 올리는 요청.
  // 처음엔 ctaButton.marginTop:48을 줬는데 화면상 이동이 거의 없었다: 위 spacer가 flex:1이라,
  // ctaButton에 marginTop을 주면 그 48px만큼 spacer의 flex-grow 몫이 그대로 줄어들어서
  // "spacer가 준 공간"이 "margin이 차지하는 공간"으로 자리만 바뀔 뿐 ctaButton의 실제 화면
  // 좌표는 그대로였다(상쇄).
  // 같은 이유로 spacer 자기 자신에 margin을 주는 것도 안 된다 — flex-grow:1인 아이템은
  // free space 계산에서 자기 margin만큼을 먼저 빼고 그 뺀 만큼을 다시 grow로 채우기 때문에,
  // spacer의 바깥 크기(outer size)가 margin 유무와 무관하게 항상 똑같아진다(자기 자신에게
  // 주는 margin은 flex-grow 아이템에서 구조적으로 무효화됨).
  // 진짜로 움직이려면 spacer "다음"에 오면서 flex-grow가 아닌 고정 크기 아이템에 여백을 줘야
  // spacer가 실제로 줄어든다 — disclaimer는 container의 마지막 자식이자 flex:1이 아니므로,
  // 여기 marginBottom을 주면 spacer가 그만큼 줄고 그만큼 버튼+안내문구 그룹 전체가 순수하게
  // 위로 이동한다(빈 공간은 disclaimer 아래, 화면 맨 밑으로 밀려남 — 그 아래는 report.tsx의
  // ScrollView contentContainer가 이미 갖고 있는 탭바용 paddingBottom이라 탭바와 겹치거나
  // 시각적으로 어색해지지 않는다). 버튼↔disclaimer 사이 간격은 container의 공용 gap:12를
  // 그대로 쓰므로 안 건드렸다.
  // (1차 재시도: 48 = 8mm 위로. 1차 재조정: 8mm 올린 상태에서 2mm/12pt만큼 다시 내리기 위해
  // 48 → 36으로 축소.)
  // 폰트 크기 +2pt 요청(10→12) — 클리핑 방지를 위해 lineHeight도 원래 비율(1.5em) 그대로
  // 12*1.5=18로 같이 키웠다(위치/색상/marginBottom 등 다른 값은 안 건드림).
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'center',
    marginBottom: 36,
  },
});
