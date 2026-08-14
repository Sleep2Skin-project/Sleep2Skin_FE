import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TODO_SUMMARY_MOCK, type AvoidListItem, type ChecklistItemResponse } from '@/constants/mockData';
import { useDesignScale } from '@/hooks/use-design-scale';
import { toggleChecklistItem, useChecklistCheckedMap } from '@/hooks/use-checklist-store';

// "+ 5 exp" 배지 전용 픽셀 폰트(node 434:1251) — 이 화면에만 로컬로 번들링한다(다른 화면 영향 없음,
// 온보딩(onboarding-flow.tsx)의 Pretendard 번들링과 동일한 패턴).
const PRESS_START_2P = 'PressStart2P-Regular';
const EXP_BADGE_FONTS = {
  [PRESS_START_2P]: require('@/assets/fonts/PressStart2P-Regular.ttf'),
};

// AvoidDetailModal 전용 Pretendard 폰트(4종) — 온보딩(onboarding-flow.tsx)과 동일한 로컬 번들링 패턴.
const PRETENDARD_LIGHT = 'Pretendard-Light';
const PRETENDARD_MEDIUM = 'Pretendard-Medium';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const PRETENDARD_BOLD = 'Pretendard-Bold';
const AVOID_DETAIL_FONTS = {
  [PRETENDARD_LIGHT]: require('@/assets/fonts/Pretendard-Light.otf'),
  [PRETENDARD_MEDIUM]: require('@/assets/fonts/Pretendard-Medium.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
  [PRETENDARD_BOLD]: require('@/assets/fonts/Pretendard-Bold.otf'),
};

// TODO — Figma 'Ui - 복사' 파일 노드 176:1165("iPhone 17 - 12")를 Figma REST API로 직접 읽어와
// index.tsx(홈 화면)와 동일하게 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것.
// 좌표는 모두 프레임(node 176:1165) 원점 기준 상대값이며, 값은 Figma가 반환한 절대좌표에서 프레임 원점을 뺀 것이다.
// 실제 추천 엔진·자체 DB가 아직 없어 목록 값은 src/constants/mockData.ts의 TODO_SUMMARY_MOCK을 사용한다.
//
// 참고: Figma 프레임 안에는 "오늘 밤 체크리스트" 3개 항목이 위치만 다르게 통째로 한 번 더
// 중복 배치되어 있었다(디자이너 작업 중 남은 복제본으로 보임, node 187:2527). 실제 앱에서
// 같은 항목을 두 번 보여줄 수 없으므로 중복본은 제외하고 한 세트만 반영했다.
//
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링).
// 캔버스는 402x874 고정 프레임(overflow:hidden)이라 세로 스케일도 함께 계산하고,
// 그래도 짧은 기기에서 남는 여백은 기존처럼 ScrollView로 감싸 안전하게 처리한다.

const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

function ChecklistRow({
  item,
  checked,
  onToggle,
  expBadgeFontReady,
}: {
  item: ChecklistItemResponse;
  checked: boolean;
  onToggle: () => void;
  expBadgeFontReady: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.checklistItem,
        checked ? styles.checklistItemChecked : styles.checklistItemUnchecked,
        pressed && styles.pressed,
      ]}>
      <View style={styles.checkboxSlot}>
        <View style={[styles.checkbox, checked ? styles.checkboxChecked : styles.checkboxUnchecked]}>
          {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
        </View>
      </View>
      <ThemedText style={styles.checklistItemTitle}>{item.title}</ThemedText>
      {/* "+ 5 exp" 배지 (node 434:1251, Press Start 2P 12px, #3366FF) — Figma 시안엔 맨 위 항목
          하나에만 예시로 붙어 있어, item.expLabel이 있을 때만 그려진다. 픽셀 폰트 로드 전엔 시스템
          폰트로 잠깐 바뀌어 보이는 걸 막기 위해 폰트 준비 전에는 아예 렌더하지 않는다. */}
      {item.expLabel && expBadgeFontReady && (
        <ThemedText style={styles.checklistItemExpBadge}>{item.expLabel}</ThemedText>
      )}
    </Pressable>
  );
}

// "오늘은 피하세요" 항목 상세 모달 — Figma 'Ui (복사)' 파일 노드 541:3131(카드 그룹, 소속 프레임
// "iPhone 17 - 8" #541:3068 원점 기준 x:26 y:137)을 그대로 옮긴 것. 일간 리포트의
// SleepScoreGamificationModal과 동일한 패턴(402x874 고정 캔버스 + useDesignScale + Modal 백드롭)을
// 쓴다 — RN Modal이 화면 전체를 덮으므로 부모(todo.tsx)가 ScrollView라도 캔버스 절대좌표를 그대로
// 쓸 수 있다. 문구는 mockData.ts의 AvoidListItem.detail을 그대로 렌더할 뿐 이 컴포넌트엔 하드코딩된
// 문구가 없다 — 실제 문구 교체는 mockData.ts TODO 블록 참고.
// 카드 padding(37px 좌우) 안쪽 실제 사용 가능 폭 — 제목 글자 크기 계산과 설명 줄 hanging indent에
// 공통으로 쓴다.
const AVOID_MODAL_CONTENT_WIDTH = 273;

// 제목 글자 크기를 항목 길이에 맞춰 계산한다. RN의 adjustsFontSizeToFit/minimumFontScale은
// react-native-web(이 프로젝트의 셀피 웹 테스트 환경)에서 동작하지 않아 — numberOfLines={1}만
// 적용되고 실제 축소는 무시돼 그대로 "..."로 잘렸다 — 웹/네이티브 모두 동작하도록 순수 JS로
// 직접 계산한다. "강한 각질 제거"(8자) 같은 짧은 제목은 Figma 원본 25px 그대로 나오고, 긴
// 제목만 폭에 맞춰 줄어든다. 그래도 안 맞을 만큼 긴 제목이 나중에 API로 들어오면 — 잘리는 것보단
// 나으므로 — 최소 크기(14px) 밑으로는 줄이지 않고 대신 자연스럽게 다음 줄로 넘어가게 둔다
// (numberOfLines를 걸지 않음 — 내용이 잘리는 것만은 피해야 한다).
function getAvoidModalTitleFontSize(title: string): number {
  // 글자당 폭을 fontSize의 1.15배로 넉넉히 잡아(Pretendard Bold 한글 기준 안전 여유) 그 폭에
  // title.length자가 딱 맞는 fontSize를 역산한다.
  const fittedSize = Math.floor(AVOID_MODAL_CONTENT_WIDTH / (title.length * 1.15));
  return Math.max(14, Math.min(25, fittedSize));
}

function AvoidDetailModal({ item, onClose }: { item: AvoidListItem | null; onClose: () => void }) {
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [fontsLoaded] = useFonts(AVOID_DETAIL_FONTS);
  const visible = item !== null;

  // 폰트 로드 전엔 렌더하지 않는다 — 시스템 폰트로 잠깐 렌더돼 줄바꿈이 튀는 걸 막는다.
  if (!visible || !fontsLoaded || !item) return null;

  const titleFontSize = getAvoidModalTitleFontSize(item.title);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* 백드롭 (node 541:3130, rgba(255,255,255,0.4) — 다른 모달들과 달리 어두운 딤이 아니라
          밝은 반투명 흰색이다, Figma 원본 그대로) — 탭하면 닫힌다. */}
      <Pressable style={styles.avoidModalBackdrop} onPress={onClose}>
        <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <View style={[styles.avoidModalCanvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
            {/* 카드 (node 541:3134, x:26 y:229 w:347, radius:30, border 2px #3060EA) — Figma는
                title/rankLabel/description을 카드 안에서 각각 고정 절대좌표로 배치했지만, 그건
                "강한 각질 제거"(짧은 제목, 한 줄)만 가정한 좌표라 "취침 전 스마트폰 장시간 사용"처럼
                제목이 두 줄로 넘어가는 항목에서는 아래 요소들과 겹쳐 보였다. 그래서 절대좌표 대신
                세로 flex 컬럼으로 바꿔, 제목이 몇 줄이 되든 뒤 요소가 항상 그 아래로 자연스럽게
                밀려나도록 한다. 카드 높이도 고정값(378) 대신 내용에 맞춰 자동으로 늘어난다.
                탭해도 안 닫히도록 배경 대신 Pressable로 감싼다. */}
            <Pressable style={styles.avoidModalCard} onPress={() => {}}>
              {/* "오늘은 피하세요" 배지 (node 541:3135/3141, w:136 h:33, fill #407AF7) */}
              <View style={styles.avoidModalBadge}>
                <Text style={styles.avoidModalBadgeText}>오늘은 피하세요</Text>
              </View>

              {/* 항목 제목 (node 541:3136) — getAvoidModalTitleFontSize로 계산한 크기를 쓴다(위
                  함수 주석 참고). "강한 각질 제거"처럼 짧은 제목은 Figma 원본 25px 그대로 나온다. */}
              <Text style={[styles.avoidModalTitle, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.2 }]}>
                {item.title}
              </Text>

              {/* 순위 라벨 (node 541:3137, color #3270F5) */}
              <Text style={styles.avoidModalRankLabel}>{item.detail.rankLabel}</Text>

              {/* 설명 (node 541:3138) — "-" 기호와 문장을 같은 Text가 아니라 별도 컬럼으로 나눠,
                  문장이 폭에 안 맞아 다음 줄로 넘어갈 때도 항상 "-" 오른쪽(문장이 시작한 자리)에서
                  시작하도록 한다(행잉 인덴트). 이전에는 Figma가 손으로 미리 3줄로 쪼개둔 문자열에
                  줄마다 공백을 다르게 넣어 흉내 냈는데, 실제 폭에서 자동 줄바꿈이 한 번 더 일어나면
                  그 공백이 안 먹혀 줄마다 시작 위치가 제각각이었다. */}
              <View style={styles.avoidModalDescriptionRow}>
                <Text style={styles.avoidModalDescriptionDash}>-</Text>
                <Text style={styles.avoidModalDescriptionText}>{item.detail.description}</Text>
              </View>

              {/* 하단 멘트 (node 541:3139) */}
              <Text style={styles.avoidModalFooter}>{item.detail.footer}</Text>
            </Pressable>

            {/* 닫기 버튼 (node 541:3142, x:322 y:265 w:20 h:19) — 카드 높이가 늘어나도 카드 상단
                모서리 기준 위치는 그대로라 캔버스 절대좌표를 유지해도 된다. */}
            <Pressable onPress={onClose} hitSlop={12} style={styles.avoidModalCloseButton}>
              <Image
                source={require('@/assets/images/figma-icon-avoid-detail-close.svg')}
                style={styles.avoidModalCloseIcon}
                contentFit="contain"
              />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function TodoScreen() {
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [expBadgeFontReady] = useFonts(EXP_BADGE_FONTS);
  // MY 탭의 "오늘의 투두 n/5" 요약과 실시간으로 맞아떨어져야 해서 로컬 useState 대신 화면 간
  // 공유 store(use-checklist-store.ts)를 쓴다.
  const checkedMap = useChecklistCheckedMap();
  const [selectedAvoidItem, setSelectedAvoidItem] = useState<AvoidListItem | null>(null);

  const completed = useMemo(() => Object.values(checkedMap).filter(Boolean).length, [checkedMap]);
  const total = TODO_SUMMARY_MOCK.checklist.length;
  const progress = total === 0 ? 0 : completed / total;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
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

          {/* "오늘은 피하세요" 카드 (node 432:1183, x:4 y:124 w:400, 항목 3개로 늘어 높이는
              내용에 맞춰 자동으로 늘어난다 — 고정 높이를 주지 않음) */}
          <View style={styles.avoidCard}>
            <ThemedText style={styles.avoidTitle}>오늘은 피하세요</ThemedText>
            <View style={styles.avoidList}>
              {TODO_SUMMARY_MOCK.avoidList.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedAvoidItem(item)}
                  style={({ pressed }) => [styles.avoidItem, pressed && styles.pressed]}>
                  <ThemedText style={styles.avoidItemTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.avoidItemReason}>{item.reason}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* "오늘 밤 체크리스트" 섹션 (node 432:1155, x:18 y:431 w:363) — 새 시안에서는 구분선이
              사라지고, 위 카드가 항목 3개만큼 늘어난 높이에 맞춰 곧바로 이어진다. */}
          <ThemedText style={styles.checklistTitle}>오늘 밤 체크리스트</ThemedText>
          <View style={styles.checklistList}>
            {TODO_SUMMARY_MOCK.checklist.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                checked={checkedMap[item.id] ?? false}
                onToggle={() => toggleChecklistItem(item.id)}
                expBadgeFontReady={expBadgeFontReady}
              />
            ))}
          </View>
          </View>
        </View>
      </ScrollView>

      <AvoidDetailModal item={selectedAvoidItem} onClose={() => setSelectedAvoidItem(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bgSoftBlue,
  },
  // useDesignScale이 화면 높이에 맞춰 캔버스를 축소하므로 보통은 스크롤이 필요 없지만,
  // 만약을 대비해 안전장치로 스크롤 가능하게 감싼다 — 캔버스 자체의 크기·스타일은 그대로 유지한다.
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
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
  // 카드 (node 541:2952/2957/2962, w:368 h:71, radius:12, fill: rgba(255,255,255,0) — 배경이
  // 없어 avoidCard/화면 배경(#DFEAFF)이 그대로 비친다. 흰 배경(#FFFFFF)이 아니다.
  avoidItem: {
    width: 368,
    backgroundColor: 'rgba(255, 255, 255, 0)',
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

  // "오늘 밤 체크리스트" (node 432:1157, x:18 y:431 w:363) — 새 시안에서는 구분선 없이 "오늘은
  // 피하세요" 카드(항목 3개, 자동 높이) 바로 아래로 이어진다.
  checklistTitle: {
    position: 'absolute',
    left: 21,
    top: 431,
    width: 363,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: '#171717',
  },
  // 항목 리스트 (node 432:1158, x:21 y:465 w:363, gap:10)
  checklistList: {
    position: 'absolute',
    left: 21,
    top: 465,
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
  // 체크 여부와 무관하게 항상 24x24 자리(unchecked 크기 기준)를 차지해, 체크박스가
  // 20x20으로 작아져도 카드(행) 높이가 함께 줄어들지 않도록 고정한다.
  checkboxSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
  // "+ 5 exp" 배지 (node 434:1251, Press Start 2P 12px, #3366FF) — 제목이 flex:1이라 남는 공간만
  // 차지하고, 배지는 줄어들지 않고 항상 제 크기로 오른쪽에 붙는다.
  checklistItemExpBadge: {
    flexShrink: 0,
    fontSize: 12,
    fontFamily: PRESS_START_2P,
    color: '#3366FF',
  },

  // ── AvoidDetailModal (node 541:3131) ────────────────────────────────────
  // 백드롭 (node 541:3130, rgba(255,255,255,0.4))
  avoidModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  avoidModalCanvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    overflow: 'hidden',
  },
  // 카드 (node 541:3134, x:26 y:229 w:347, radius:30, border 2px #3060EA) — 세로 flex 컬럼으로
  // 자식을 쌓는다(위 JSX 주석 참고). paddingTop 28은 카드 상단에서 배지 상단까지의 원래 간격
  // (257-229), paddingHorizontal 37은 배지/제목/순위 라벨의 원래 좌측 여백(36.82)에 맞춘 값 —
  // 설명(원래 29.74)만 약 7px 안쪽으로 들어오지만 눈에 띄지 않는 차이라 통일했다. paddingBottom
  // 44는 원래 하단 멘트 아래 여백(607-563)을 근사한 값.
  avoidModalCard: {
    position: 'absolute',
    left: 26,
    top: 229,
    width: 347,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#3060EA',
    borderRadius: 30,
    paddingTop: 28,
    paddingBottom: 44,
    paddingHorizontal: 37,
  },
  // "오늘은 피하세요" 배지 (node 541:3135, w:136 h:33, fill #407AF7, radius:16) — 글자를 flex로
  // 중앙 정렬해 배지 안에서 어긋나 보이지 않게 한다.
  avoidModalBadge: {
    width: 136,
    height: 33,
    backgroundColor: '#407AF7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 배지 텍스트 (node 541:3141, Pretendard Medium 17px, 흰색)
  avoidModalBadgeText: {
    fontSize: 17,
    fontFamily: PRETENDARD_MEDIUM,
    color: '#FFFFFF',
  },
  // 항목 제목 (node 541:3136, Pretendard Bold) — fontSize/lineHeight는 getAvoidModalTitleFontSize
  // 계산값을 인라인으로 얹는다(위 JSX 참고). width를 카드 내용 폭에 고정해 실제 줄바꿈 판단이
  // getAvoidModalTitleFontSize가 가정한 폭(AVOID_MODAL_CONTENT_WIDTH)과 어긋나지 않게 한다.
  // 원래 간격(badge 하단→제목 상단, 18px)만큼 marginTop을 준다.
  avoidModalTitle: {
    marginTop: 18,
    width: AVOID_MODAL_CONTENT_WIDTH,
    fontFamily: PRETENDARD_BOLD,
    color: '#171717',
  },
  // 순위 라벨 (node 541:3137, Pretendard SemiBold 21px, lineHeight:27px, #3270F5, 제목 하단과 원래
  // 간격 10px)
  avoidModalRankLabel: {
    marginTop: 10,
    fontSize: 21,
    lineHeight: 27,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#3270F5',
  },
  // 설명 (node 541:3138, Pretendard Medium 21px, lineHeight:31px, #404040, 순위 라벨 하단과 원래
  // 간격 34px) — "-"와 문장을 좌우로 나눠, 문장이 줄바꿈돼도 항상 "-" 오른쪽 열에서 시작하게
  // 한다(행잉 인덴트, 위 JSX 주석 참고).
  avoidModalDescriptionRow: {
    marginTop: 34,
    flexDirection: 'row',
  },
  avoidModalDescriptionDash: {
    width: 20,
    fontSize: 21,
    lineHeight: 31,
    fontFamily: PRETENDARD_MEDIUM,
    color: '#404040',
  },
  avoidModalDescriptionText: {
    flex: 1,
    fontSize: 21,
    lineHeight: 31,
    fontFamily: PRETENDARD_MEDIUM,
    color: '#404040',
  },
  // 하단 멘트 (node 541:3139, Pretendard Light 17px, lineHeight:21px, 중앙 정렬, 설명 하단과 원래
  // 간격 39px)
  avoidModalFooter: {
    marginTop: 39,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 21,
    fontFamily: PRETENDARD_LIGHT,
    color: '#000000',
  },
  // 닫기 버튼 (node 541:3142, x:322 y:265 w:20 h:19, #407AF7)
  avoidModalCloseButton: {
    position: 'absolute',
    left: 322,
    top: 265,
  },
  avoidModalCloseIcon: {
    width: 20,
    height: 19,
  },
});
