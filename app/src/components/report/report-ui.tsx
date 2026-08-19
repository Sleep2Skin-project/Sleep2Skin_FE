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

// Figma node 350:777~785 — 남색 트랙 위에 선택된 탭만 흰색 알약, 나머지는 흰색 60% 텍스트로
// 트랙에 묻힌다. 다크모드와 무관한 고정 색이라 테마 토큰을 쓰지 않는다.
export function PeriodTabs({ selected, onSelect }: { selected: Period; onSelect: (period: Period) => void }) {
  return (
    <View style={styles.tabTrack}>
      {PERIOD_ORDER.map((period) => {
        const active = period === selected;
        return (
          <Pressable
            key={period}
            onPress={() => onSelect(period)}
            style={({ pressed }) => [
              styles.tabItem,
              active && styles.tabItemActive,
              pressed && !active && styles.tabItemPressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={[styles.tabLabel, { color: active ? Colors.primaryDark : 'rgba(255, 255, 255, 0.6)' }]}>
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
  // 아이폰16 규격 맞추기 — 탭 바 전체를 6pt(1mm) 아래로 내리는 요청이라 marginTop을 줬다.
  // 이 트랙은 report.tsx의 tabsWrap(일반 flow, position 지정 없음) 안에서 렌더되므로, 아래로
  // 밀리는 만큼 그 다음에 오는 ScrollView 콘텐츠도 같이 밀려 겹칠 일이 없다.
  // 재점검(화면 반영이 거의 안 보인다는 피드백): CTA 버튼 때와 달리 이건 flex-grow 부모가
  // 아니라 그냥 일반 flow(View) 안의 marginTop이라 상쇄되는 구조가 아니다 — React Native/Yoga는
  // 웹 CSS와 달리 margin collapsing이 아예 없어서, 이 marginTop은 항상 그대로 반영된다(tabsWrap도
  // paddingBottom만 있을 뿐 이 값과 충돌하는 자체 padding/margin이 없음). 실제로는 6pt(1mm)
  // 자체가 화면 맨 위, 비교 기준선도 없는 곳에서의 이동이라 육안으로 인지하기 어려울 만큼
  // 작은 값이었을 가능성이 높다. 추가 요청(+2pt)까지 반영해 6→8로 늘렸다.
  tabTrack: {
    marginTop: 8,
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
    gap: 2,
    backgroundColor: Colors.primaryDark,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  tabItemActive: {
    backgroundColor: Colors.white,
  },
  tabItemPressed: {
    opacity: 0.6,
  },
  // 폰트 크기 +2pt 요청(12→14) — ThemedText type="smallBold"의 기본 lineHeight(20)가 이미
  // fontSize14보다 훨씬 여유 있어(20>14) 알약 패딩(paddingVertical:8) 안에서 잘리지 않는다.
  tabLabel: {
    fontSize: 14,
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
