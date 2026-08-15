import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { getDailyTimeline, type DailyTimelineSegment, type SleepTimelineStage } from '@/api/report';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TEMP_USER_ID } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// REP-03 수면 단계 타임라인의 팝업 버전 — docs/home.png 우측 '팝업창' 와이어프레임을 그대로 따른다.
// GET /api/v1/report/daily/timeline로 실연동한다(api/report.ts). segments는 시작시각 오름차순이
// 서버에서 보장되므로 재정렬하지 않고 그대로 stageBar에 순서대로 얹는다.
//
// 🚨 집계 재계산 금지: segments는 렌더링 전용이다. 각 구간 "자기 자신"의 길이(endTime-startTime)로
// 그 구간의 막대 너비를 정하는 것은 렌더링이라 허용되지만, 여러 구간을 stage별로 합산해 "깊은
// 수면 총 시간" 같은 합계를 만들면 안 된다(그 합계는 이미 GET /report/daily가 계산해서 준다).
// 그래서 아래 legend는 값(분)을 보여주지 않고 색상-라벨 범례로만 남긴다 — 예전 mock처럼 스테이지별
// 총 분(minutes)을 표시하지 않는다.
const AVG_HEART_RATE = '62 BPM AVG'; // 심박수는 이 API 범위 밖 — 아직 별도 목업

const STAGE_INFO: Record<SleepTimelineStage, { label: string; color: string }> = {
  DEEP: { label: 'Deep', color: '#1C3F94' },
  CORE: { label: 'Core', color: '#3C87F7' },
  REM: { label: 'REM', color: '#9DC3FB' },
  AWAKE: { label: 'Awake', color: '#E5E5EA' },
  UNSPECIFIED: { label: 'Unspecified', color: '#B5B8BD' },
};
// 범례에 항상 보여줄 순서 — Object 순회 순서에 기대지 않고 고정한다.
const STAGE_LEGEND_ORDER: SleepTimelineStage[] = ['DEEP', 'CORE', 'REM', 'AWAKE', 'UNSPECIFIED'];

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** ISO 8601 문자열을 KST(UTC+9) "HH:mm"으로 안전하게 포맷한다. null이거나 파싱 실패면 '--:--'로 방어한다. */
function formatTimeKSTSafe(iso: string | null): string {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const hours = String(kst.getUTCHours()).padStart(2, '0');
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** 구간 자기 자신의 길이(분) — 막대 너비 계산용. 파싱 실패/역전 구간은 0으로 방어해 화면이 안 뻗게 한다. */
function safeSegmentDurationMinutes(segment: DailyTimelineSegment): number {
  const start = new Date(segment.startTime).getTime();
  const end = new Date(segment.endTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / 60000;
}

type TimelineState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string | null }
  | { status: 'available'; sleepOnsetTime: string; wakeTime: string; segments: DailyTimelineSegment[] };

type SleepDetailModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function SleepDetailModal({ visible, onClose }: SleepDetailModalProps) {
  const theme = useTheme();
  const [timelineState, setTimelineState] = useState<TimelineState>({ status: 'loading' });

  useEffect(() => {
    getDailyTimeline(getTodayDateString(), TEMP_USER_ID)
      .then(({ data }) => {
        setTimelineState(
          data.status === 'AVAILABLE'
            ? {
                status: 'available',
                sleepOnsetTime: data.sleepOnsetTime,
                wakeTime: data.wakeTime,
                segments: data.segments,
              }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch(() => setTimelineState({ status: 'error' }));
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* 내부 Pressable로 터치를 가로채 시트를 탭해도 닫히지 않게 한다. */}
        <Pressable onPress={() => {}}>
          <ThemedView style={styles.sheet}>
            <View style={[styles.grabber, { backgroundColor: theme.backgroundSelected }]} />

            <View style={styles.header}>
              <ThemedText type="subtitle">Sleep</ThemedText>
              <ThemedText style={styles.moonIcon}>🌙</ThemedText>
            </View>

            {timelineState.status === 'loading' && (
              <ThemedText themeColor="textSecondary">불러오는 중...</ThemedText>
            )}
            {timelineState.status === 'error' && (
              <ThemedText themeColor="textSecondary">수면 타임라인을 불러오지 못했어요</ThemedText>
            )}
            {/* NO_SLEEP_DATA — 에러가 아니라 정상 빈 상태. 화면이 뻗지 않도록 막대/범례 없이 안내
                문구만 보여준다. */}
            {timelineState.status === 'no_data' && (
              <ThemedText themeColor="textSecondary">
                {timelineState.message ?? '그날의 수면 데이터가 없어요'}
              </ThemedText>
            )}

            {timelineState.status === 'available' && (
              <>
                {/* 취침~기상(node 실제 API 값) — 예전 "8hr 29min" 하드코딩 총 수면시간은 이 API
                    범위 밖(합계는 GET /report/daily 소관)이라 제거하고, 이 API가 실제로 주는
                    취침~기상 시각을 대신 히어로 텍스트로 보여준다. */}
                <View style={styles.mainStat}>
                  <ThemedText style={styles.mainStatValue}>
                    {formatTimeKSTSafe(timelineState.sleepOnsetTime)} – {formatTimeKSTSafe(timelineState.wakeTime)}
                  </ThemedText>
                  <ThemedText style={styles.asleepTimeLabel}>취침 – 기상</ThemedText>
                </View>

                <View style={[styles.stageBar, { backgroundColor: theme.backgroundSelected }]}>
                  {timelineState.segments.map((segment, index) => (
                    <View
                      key={`${segment.startTime}-${index}`}
                      style={[
                        styles.stageSegment,
                        {
                          flex: safeSegmentDurationMinutes(segment),
                          backgroundColor: STAGE_INFO[segment.stage].color,
                        },
                      ]}
                    />
                  ))}
                </View>

                {/* 범례는 색상-라벨만 보여준다(스테이지별 합계 분(minutes)은 표시하지 않음) —
                    위 파일 상단 주석의 "집계 재계산 금지" 규칙 참고. */}
                <View style={styles.legendRow}>
                  {STAGE_LEGEND_ORDER.map((stage) => (
                    <View key={stage} style={styles.legendItem}>
                      <View style={styles.legendHeader}>
                        <View style={[styles.legendDot, { backgroundColor: STAGE_INFO[stage].color }]} />
                        <ThemedText type="small" themeColor="textSecondary">
                          {STAGE_INFO[stage].label}
                        </ThemedText>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={[styles.footerRow, { borderTopColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                ♥ {AVG_HEART_RATE}
              </ThemedText>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: Spacing.half,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moonIcon: {
    fontSize: 22,
  },
  mainStat: {
    gap: Spacing.half,
  },
  mainStatValue: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
  },
  asleepTimeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3C87F7',
  },
  stageBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  stageSegment: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.three,
  },
  legendItem: {
    minWidth: '22%',
    gap: Spacing.half,
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
