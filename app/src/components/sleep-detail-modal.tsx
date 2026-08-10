import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// REP-03 수면 단계 타임라인의 팝업 버전 — docs/home.png 우측 '팝업창' 와이어프레임을 그대로 따른다.
// 실제 API가 없으므로 지난밤 수면 단계 목업값을 기본값으로 쓰되, HealthKit 연동 후에는 실제 구간을
// segments prop으로 넘기면 된다 — 아래 stageBar/legendRow는 flex 비율로 그려서 값만 바뀌면 그대로 반영된다.
export type SleepStageSegment = {
  key: string;
  label: string;
  minutes: number;
  color: string;
};

const DEFAULT_SLEEP_STAGES: SleepStageSegment[] = [
  { key: 'awake', label: 'Awake', minutes: 39, color: '#E5E5EA' },
  { key: 'rem', label: 'REM', minutes: 102, color: '#9DC3FB' },
  { key: 'core', label: 'Core', minutes: 328, color: '#3C87F7' },
  { key: 'deep', label: 'Deep', minutes: 60, color: '#1C3F94' },
];

const SLEEP_WINDOW = '01:00-09:29';
const AVG_HEART_RATE = '62 BPM AVG';

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

type SleepDetailModalProps = {
  visible: boolean;
  onClose: () => void;
  /** HealthKit 연동 전까지는 생략 가능 — 생략 시 목업 구간을 보여준다. */
  segments?: SleepStageSegment[];
};

export function SleepDetailModal({ visible, onClose, segments = DEFAULT_SLEEP_STAGES }: SleepDetailModalProps) {
  const theme = useTheme();

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

            <View style={styles.mainStat}>
              <ThemedText style={styles.mainStatValue}>
                8<ThemedText style={styles.mainStatUnit}> hr </ThemedText>
                29<ThemedText style={styles.mainStatUnit}> min</ThemedText>
              </ThemedText>
              <ThemedText style={styles.asleepTimeLabel}>Asleep Time</ThemedText>
            </View>

            <View style={[styles.stageBar, { backgroundColor: theme.backgroundSelected }]}>
              {segments.map((stage) => (
                <View
                  key={stage.key}
                  style={[styles.stageSegment, { flex: stage.minutes, backgroundColor: stage.color }]}
                />
              ))}
            </View>

            <View style={styles.legendRow}>
              {segments.map((stage) => (
                <View key={stage.key} style={styles.legendItem}>
                  <View style={styles.legendHeader}>
                    <View style={[styles.legendDot, { backgroundColor: stage.color }]} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {stage.label}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold">{formatDuration(stage.minutes)}</ThemedText>
                </View>
              ))}
            </View>

            <View style={[styles.footerRow, { borderTopColor: theme.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {SLEEP_WINDOW}
              </ThemedText>
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
    fontSize: 40,
    fontWeight: '700',
    lineHeight: 46,
  },
  mainStatUnit: {
    fontSize: 18,
    fontWeight: '500',
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
