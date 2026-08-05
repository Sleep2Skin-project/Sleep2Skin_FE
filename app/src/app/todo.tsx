import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';

// TODO — Figma 'Ui - 복사' 파일 노드 176:1165("iPhone 17 - 12")를 Figma REST API로 직접 읽어와
// index.tsx(홈 화면)와 동일하게 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것.
// 좌표는 모두 프레임(node 176:1165) 원점 기준 상대값이며, 값은 Figma가 반환한 절대좌표에서 프레임 원점을 뺀 것이다.
// 실제 추천 엔진·자체 DB가 아직 없어 목록 값은 전부 목업이다.
//
// 참고: Figma 프레임 안에는 "오늘 밤 체크리스트" 3개 항목이 위치만 다르게 통째로 한 번 더
// 중복 배치되어 있었다(디자이너 작업 중 남은 복제본으로 보임, node 187:2527). 실제 앱에서
// 같은 항목을 두 번 보여줄 수 없으므로 중복본은 제외하고 한 세트만 반영했다.
const AVOID_LIST = [
  { id: 'exfoliation', title: '강한 각질 제거', reason: '스크럽·AHA는 장벽이 회복된 뒤에' },
  { id: 'new-product', title: '새 제품 첫 사용', reason: '오늘은 반응을 예측하기 어려워요' },
] as const;

type ChecklistItem = {
  id: string;
  title: string;
  status: string;
  // 상태 라벨 색상 — 체크 여부가 아니라 상태 내용 자체에 따라 결정된다(Figma 원본 기준).
  // "미확인"처럼 아직 값을 알 수 없는 상태만 muted 회색, 그 외(통과/알림 시각)는 포인트 블루.
  statusMuted: boolean;
  defaultChecked: boolean;
};

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'caffeine-cutoff', title: '카페인 컷오프 15:00', status: '통과', statusMuted: false, defaultChecked: false },
  { id: 'screen-off', title: '취침 30분 전 화면 끄기', status: '22:40 알림', statusMuted: false, defaultChecked: false },
  { id: 'room-temp', title: '침실 온도 19–21°C', status: '미확인', statusMuted: true, defaultChecked: false },
];

const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

function ChecklistRow({
  item,
  checked,
  onToggle,
}: {
  item: ChecklistItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.checklistItem,
        checked ? styles.checklistItemChecked : styles.checklistItemUnchecked,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : styles.checkboxUnchecked]}>
        {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
      </View>
      <ThemedText style={styles.checklistItemTitle}>{item.title}</ThemedText>
      <ThemedText style={[styles.checklistItemStatus, item.statusMuted && styles.checklistItemStatusMuted]}>
        {item.status}
      </ThemedText>
    </Pressable>
  );
}

export default function TodoScreen() {
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.id, item.defaultChecked])),
  );

  const completed = useMemo(() => Object.values(checkedMap).filter(Boolean).length, [checkedMap]);
  const total = CHECKLIST_ITEMS.length;
  const progress = total === 0 ? 0 : completed / total;

  const handleToggle = (id: string) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <View style={styles.screen}>
      <View style={styles.canvas}>
        {/* 배경 (fill #DFEAFF) */}
        <View style={StyleSheet.absoluteFill} />

        {/* Spiral Notepad 아이콘 + "오늘의 투두리스트" (node 176:1228, x:71 y:71 w:168 h:26) */}
        <Image
          source={require('@/assets/images/figma-icon-notepad.png')}
          style={styles.notepadIcon}
          contentFit="contain"
        />
        <ThemedText style={styles.pageTitle}>오늘의 투두리스트</ThemedText>

        {/* 유령 캐릭터 (node 187:2526, x:309 y:55 w:89 h:89) */}
        <Image
          source={require('@/assets/images/figma-icon-ghost-todo.png')}
          style={styles.ghostImage}
          contentFit="contain"
        />

        {/* "진행도" + 진행 바 + "n/total" (node 176:1229~1232) */}
        <ThemedText style={styles.progressLabel}>진행도</ThemedText>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <ThemedText style={styles.progressCount}>
          {completed}/{total}
        </ThemedText>

        {/* "오늘은 피하세요" 카드 (node 187:2505, x:9 y:125 w:400 h:216) */}
        <View style={styles.avoidCard}>
          <ThemedText style={styles.avoidTitle}>오늘은 피하세요</ThemedText>
          <View style={styles.avoidList}>
            {AVOID_LIST.map((item) => (
              <View key={item.id} style={styles.avoidItem}>
                <ThemedText style={styles.avoidItemTitle}>{item.title}</ThemedText>
                <ThemedText style={styles.avoidItemReason}>{item.reason}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* Line 2 구분선 (node 176:1251, x:25 y:345 w:359) */}
        <View style={styles.divider} />

        {/* "오늘 밤 체크리스트" 섹션 (node 176:1166, x:21 y:359 w:363 h:216) */}
        <ThemedText style={styles.checklistTitle}>오늘 밤 체크리스트</ThemedText>
        <View style={styles.checklistList}>
          {CHECKLIST_ITEMS.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              checked={checkedMap[item.id] ?? false}
              onToggle={() => handleToggle(item.id)}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  // 프레임(node 176:1165): 402x874, fill #DFEAFF — 홈 화면(index.tsx)과 동일한 고정 해상도
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: Colors.bgSoftBlue,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },

  // Spiral Notepad (node 187:2551, x:27 y:71 w:31 h:31)
  notepadIcon: {
    position: 'absolute',
    left: 27,
    top: 71,
    width: 31,
    height: 31,
  },
  // "오늘의 투두리스트" (node 176:1228, x:71 y:71 w:168 h:26)
  pageTitle: {
    position: 'absolute',
    left: 71,
    top: 71,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // ghost2-transparent 1 (node 187:2526, x:309 y:55 w:89 h:89)
  ghostImage: {
    position: 'absolute',
    left: 309,
    top: 55,
    width: 89,
    height: 89,
  },

  // "진행도" (node 176:1229, x:78 y:107 w:103 h:17)
  progressLabel: {
    position: 'absolute',
    left: 78,
    top: 107,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#383838',
  },
  // 진행 트랙 배경 value (node 176:1230, x:127 y:113 w:95 h:7, radius:6)
  progressTrack: {
    position: 'absolute',
    left: 127,
    top: 113,
    width: 95,
    height: 7,
    borderRadius: 6,
    backgroundColor: '#C2C2C2',
    overflow: 'hidden',
  },
  // 진행 트랙 채움 value (node 176:1232, x:127 y:113 w:55 h:7, radius:6)
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
  },
  // "1/5" (node 176:1231, x:227 y:109 w:17 h:16)
  progressCount: {
    position: 'absolute',
    left: 227,
    top: 109,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: '#000000',
  },

  // "div" 오늘은 피하세요 카드 (node 187:2505, x:9 y:125 w:400 h:216, radius:16)
  avoidCard: {
    position: 'absolute',
    left: 9,
    top: 125,
    width: 400,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  // "오늘은 피하세요" (node 187:2507, w:368 h:21)
  avoidTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#FF4242',
  },
  avoidList: {
    gap: 8,
  },
  // 카드 (node 187:2514/187:2519, w:368 h:71, radius:12)
  avoidItem: {
    width: 368,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(112, 115, 124, 0.22)',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
    gap: 3,
  },
  // (node 187:2516/187:2521, w:338 h:18)
  avoidItemTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#171717',
  },
  // (node 187:2518/187:2523, w:338 h:19)
  avoidItemReason: {
    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: '400',
    color: 'rgba(55, 56, 60, 0.61)',
  },

  // Line 2 (node 176:1251, x:25 y:345 w:359, stroke #C8C8C8)
  divider: {
    position: 'absolute',
    left: 25,
    top: 345,
    width: 359,
    height: 1,
    backgroundColor: '#C8C8C8',
  },

  // "오늘 밤 체크리스트" (node 176:1168, x:21 y:359 w:363 h:19)
  checklistTitle: {
    position: 'absolute',
    left: 21,
    top: 359,
    width: 363,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#171717',
  },
  // 항목 리스트 (node 176:1169, x:21 y:393 w:363 h:182, gap:10)
  checklistList: {
    position: 'absolute',
    left: 21,
    top: 393,
    width: 363,
    gap: 10,
  },
  // 항목 카드 (node 176:1170/1177/1183, w:363 h:53~54, radius:14)
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
  },
  checklistItemChecked: {
    backgroundColor: 'rgba(0, 102, 255, 0.08)',
    borderColor: '#3366FF',
  },
  checklistItemUnchecked: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(112, 115, 124, 0.22)',
  },
  // 체크박스 (node 176:1171 체크됨 w:20 h:20 radius:6 / 176:1178,1184 미체크 w:24 h:24 radius:6)
  checkbox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  checkboxChecked: {
    width: 20,
    height: 20,
    backgroundColor: '#3366FF',
  },
  checkboxUnchecked: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: 'rgba(112, 115, 124, 0.22)',
  },
  checkmark: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // 항목 제목 (node 176:1174/1180/1186, fontSize:15 lh:18)
  checklistItemTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#171717',
  },
  // 상태 라벨 (node 176:1176/1182/1188, fontSize:12 lh:15)
  checklistItemStatus: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: '#3366FF',
  },
  checklistItemStatusMuted: {
    color: 'rgba(55, 56, 60, 0.28)',
  },
});
