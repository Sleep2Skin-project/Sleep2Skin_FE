import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// TODO (TODO-01~07) — docs/todo.png 와이어프레임을 그대로 따른다.
// 실제 추천 엔진(TODO-02)·자체 DB가 아직 없어 아래 값은 전부 목업이며,
// 캐릭터(TODO 전용 예고 영역)는 회색 Placeholder 박스로만 비워둔다.
const AVOID_LIST = [
  { id: 'exfoliation', title: '강한 각질 제거', reason: '스크럽·AHA는 장벽이 회복된 뒤에' },
  { id: 'hot-water', title: '뜨거운 물 세안', reason: '미온수로 30초 이내 씻기' },
  { id: 'new-product', title: '새 제품 첫 사용', reason: '오늘은 반응을 예측하기 어려워요' },
] as const;

type ChecklistItem = {
  id: string;
  title: string;
  status: string;
  defaultChecked: boolean;
};

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'caffeine-cutoff', title: '카페인 컷오프 15:00', status: '통과', defaultChecked: false },
  { id: 'screen-off', title: '취침 30분 전 화면 끄기', status: '22:40 알림', defaultChecked: false },
  { id: 'room-temp', title: '침실 온도 19-21°C', status: '미확인', defaultChecked: false },
];

function ProgressHeader({ completed, total }: { completed: number; total: number }) {
  const theme = useTheme();
  const progress = total === 0 ? 0 : completed / total;

  return (
    <View style={styles.progressSection}>
      <ThemedText type="subtitle" style={styles.pageTitle}>
        오늘의 투두리스트
      </ThemedText>
      <View style={styles.progressRow}>
        <ThemedText type="small" themeColor="textSecondary">
          진행도
        </ThemedText>
        <View style={[styles.progressTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.text }]} />
        </View>
        <ThemedText type="smallBold" style={styles.progressCount}>
          {completed}/{total}
        </ThemedText>
      </View>
    </View>
  );
}

function CharacterPlaceholder() {
  const theme = useTheme();

  // 다음 캐릭터 예고 영역 — 에셋 미정이라 비워둔 임시 박스만 배치한다.
  return <View style={[styles.characterPlaceholder, { backgroundColor: theme.backgroundElement }]} />;
}

function AvoidSection() {
  const theme = useTheme();

  return (
    <View style={[styles.avoidCard, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={styles.avoidTitle}>오늘은 피하세요</ThemedText>
      <View style={styles.avoidList}>
        {AVOID_LIST.map((item) => (
          <View key={item.id} style={styles.avoidItem}>
            <ThemedText type="smallBold">{item.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.reason}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function ChecklistRow({
  item,
  checked,
  onToggle,
}: {
  item: ChecklistItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.checklistItem,
        { borderColor: checked ? theme.text : theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? theme.text : theme.textSecondary,
            backgroundColor: checked ? theme.text : 'transparent',
          },
        ]}>
        {checked && (
          <ThemedText themeColor="background" style={styles.checkmark}>
            ✓
          </ThemedText>
        )}
      </View>
      <ThemedText type="smallBold" style={styles.checklistItemTitle}>
        {item.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {item.status}
      </ThemedText>
    </Pressable>
  );
}

function ChecklistSection({
  checkedMap,
  onToggle,
}: {
  checkedMap: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <View style={styles.checklistSection}>
      <ThemedText style={styles.checklistTitle}>오늘 밤 체크리스트</ThemedText>
      <View style={styles.checklistList}>
        {CHECKLIST_ITEMS.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            checked={checkedMap[item.id] ?? false}
            onToggle={() => onToggle(item.id)}
          />
        ))}
      </View>
    </View>
  );
}

export default function TodoScreen() {
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.id, item.defaultChecked])),
  );

  const completed = useMemo(() => Object.values(checkedMap).filter(Boolean).length, [checkedMap]);
  const total = CHECKLIST_ITEMS.length;

  const handleToggle = (id: string) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const contentPlatformStyle = {
    paddingTop: safeAreaInsets.top + Spacing.three,
    paddingBottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.container}>
        <ProgressHeader completed={completed} total={total} />
        <CharacterPlaceholder />
        <AvoidSection />
        <ChecklistSection checkedMap={checkedMap} onToggle={handleToggle} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  progressSection: {
    gap: Spacing.three,
  },
  pageTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressCount: {
    color: '#3c87f7',
  },
  characterPlaceholder: {
    height: 220,
    borderRadius: Spacing.three,
  },
  avoidCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  avoidTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FF3B30',
  },
  avoidList: {
    gap: Spacing.two,
  },
  avoidItem: {
    gap: Spacing.half,
  },
  checklistSection: {
    gap: Spacing.three,
  },
  checklistTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  checklistList: {
    gap: Spacing.two,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Spacing.one,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 13,
    fontWeight: '700',
  },
  checklistItemTitle: {
    flex: 1,
  },
});
