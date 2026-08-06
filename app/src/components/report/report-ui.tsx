import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// REPORT 탭(REP-01~11) 전 구간에서 재사용하는 조립 부품.
// docs/report.png 와이어프레임은 Figma 픽셀 좌표가 아닌 저해상도 스케치이므로,
// index.tsx/todo.tsx처럼 절대좌표를 그대로 옮기지 않고 반응형 카드 레이아웃으로 구성한다.

export type Period = 'daily' | 'weekly' | 'monthly' | 'overall';

export const PERIOD_LABELS: Record<Period, string> = {
  daily: '일간',
  weekly: '주간',
  monthly: '월간',
  overall: '종합',
};

const PERIOD_ORDER: Period[] = ['daily', 'weekly', 'monthly', 'overall'];

export function PeriodTabs({ selected, onSelect }: { selected: Period; onSelect: (period: Period) => void }) {
  const theme = useTheme();

  return (
    <View style={[styles.tabTrack, { backgroundColor: theme.backgroundElement }]}>
      {PERIOD_ORDER.map((period) => {
        const active = period === selected;
        return (
          <Pressable
            key={period}
            onPress={() => onSelect(period)}
            style={({ pressed }) => [
              styles.tabItem,
              active && { backgroundColor: Colors.primaryDark },
              pressed && !active && styles.tabItemPressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={[styles.tabLabel, { color: active ? Colors.white : theme.textSecondary }]}>
              {PERIOD_LABELS[period]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function InsightBanner({ text }: { text: string }) {
  return (
    <View style={styles.insightBanner}>
      <ThemedText style={styles.insightText}>{text}</ThemedText>
    </View>
  );
}

export function SectionCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <ThemedText style={styles.sectionTitle}>{children}</ThemedText>;
}

export type StatItem = { key: string; label: string; value: string };

export function StatGrid({ items }: { items: StatItem[] }) {
  const theme = useTheme();
  return (
    <View style={styles.statGrid}>
      {items.map((item) => (
        <View key={item.key} style={[styles.statBox, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            {item.label}
          </ThemedText>
          <ThemedText style={styles.statValue}>{item.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

export function GaugeRow({
  label,
  value,
  delta,
  max = 100,
}: {
  label: string;
  value: number;
  delta: number;
  max?: number;
}) {
  const theme = useTheme();
  const deltaColor = delta > 0 ? Colors.success : delta < 0 ? Colors.danger : theme.textSecondary;
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <View style={styles.gaugeRow}>
      <ThemedText style={styles.gaugeLabel}>{label}</ThemedText>
      <View style={[styles.gaugeTrack, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.gaugeFill, { width: `${Math.min(100, (value / max) * 100)}%` }]} />
      </View>
      <ThemedText style={styles.gaugeValue}>
        {value} <ThemedText style={{ color: deltaColor }}>{deltaText}</ThemedText>
      </ThemedText>
    </View>
  );
}

export type FactorStrength = '매우 강함' | '강함' | '보통' | '약함';

export const STRENGTH_META: Record<FactorStrength, { color: string; widthPercent: number }> = {
  '매우 강함': { color: Colors.danger, widthPercent: 92 },
  강함: { color: Colors.warning, widthPercent: 68 },
  보통: { color: '#9AA5B1', widthPercent: 42 },
  약함: { color: '#C7CDD4', widthPercent: 20 },
};

export function FactorRow({
  factor,
  target,
  strength,
}: {
  factor: string;
  target: string;
  strength: FactorStrength;
}) {
  const theme = useTheme();
  const meta = STRENGTH_META[strength];

  return (
    <View style={styles.factorRow}>
      <View style={styles.factorHeader}>
        <ThemedText style={styles.factorLabel}>
          {factor} → {target}
        </ThemedText>
        <ThemedText style={[styles.factorStrength, { color: meta.color }]}>{strength}</ThemedText>
      </View>
      <View style={[styles.factorTrack, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.factorFill, { width: `${meta.widthPercent}%`, backgroundColor: meta.color }]} />
      </View>
    </View>
  );
}

export type BarChartDatum = { key: string; label: string; value: number; highlighted?: boolean };

export function BarChart({
  data,
  maxValue,
  targetValue,
  height = 120,
}: {
  data: BarChartDatum[];
  maxValue: number;
  targetValue?: number;
  height?: number;
}) {
  const theme = useTheme();

  return (
    <View>
      <View style={[styles.chartArea, { height }]}>
        {targetValue !== undefined && (
          <View
            style={[
              styles.targetLine,
              { bottom: (targetValue / maxValue) * height, borderTopColor: theme.textSecondary },
            ]}
          />
        )}
        <View style={styles.barsRow}>
          {data.map((bar) => (
            <View key={bar.key} style={styles.barColumn}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(4, (bar.value / maxValue) * height),
                    backgroundColor: bar.highlighted ? Colors.primaryDark : theme.backgroundSelected,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      </View>
      <View style={styles.barLabelsRow}>
        {data.map((bar) => (
          <View key={bar.key} style={styles.barColumn}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.barLabel}>
              {bar.label}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabTrack: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  tabItemPressed: {
    opacity: 0.6,
  },
  tabLabel: {
    fontSize: 13,
  },

  insightBanner: {
    backgroundColor: Colors.primaryDark,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  insightText: {
    color: Colors.white,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },

  card: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },

  sectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },

  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statBox: {
    flexBasis: '31%',
    flexGrow: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: 2,
  },
  statValue: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
  },

  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  gaugeLabel: {
    width: 68,
    fontSize: 13,
    fontWeight: '600',
  },
  gaugeTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primaryDark,
  },
  gaugeValue: {
    width: 56,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
  },

  factorRow: {
    gap: Spacing.half,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  factorLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  factorStrength: {
    fontSize: 13,
    fontWeight: '700',
  },
  factorTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  factorFill: {
    height: '100%',
    borderRadius: 3,
  },

  chartArea: {
    position: 'relative',
    justifyContent: 'flex-end',
  },
  targetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
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
  bar: {
    width: 18,
    borderRadius: 5,
  },
  barLabelsRow: {
    flexDirection: 'row',
    marginTop: Spacing.one,
  },
  barLabel: {
    fontSize: 11,
  },
});
