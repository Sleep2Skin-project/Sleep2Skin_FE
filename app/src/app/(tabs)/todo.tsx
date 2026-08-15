import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AttendanceExpInfo } from '@/api/game';
import {
  getDailyTodos,
  TodoActionApiError,
  updateTodoStatus,
  type TodoAvoidItem,
  type TodoChecklistItem,
} from '@/api/todo';
import { ExpGainPopup } from '@/components/exp-gain-popup';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { useDesignScale } from '@/hooks/use-design-scale';

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
//
// GET /api/v1/todo(TODO-02~05)로 실연동한다(api/todo.ts). avoidItems와 checklistItems는 필드가
// 서로 다른 별개 배열이다 — avoidItems는 causeLabel(태그)+reason(롱프레스 설명)만, checklistItems는
// status(PENDING/DONE)만 갖는다(체크박스 토글 대상은 checklistItems뿐, avoidItems엔 애초에
// 체크박스 자체가 없다).
//
// 체크 토글은 PATCH /api/v1/todo/{id}(TODO-05)로 실연동한다(api/todo.ts의 updateTodoStatus).
// 응답 대기 중 어색하지 않도록 낙관적 업데이트(먼저 화면부터 바꾸고, 실패하면 되돌림)를 쓴다.
// exp가 실제로 움직였을 때(gained !== 0, 플러스든 마이너스든)만 ExpGainPopup을 띄운다 — 이
// 팝업은 HOME-04(출석 체크인)와 완전히 같은 exp 모양(AttendanceExpInfo)을 공유하는 컴포넌트다.
// 다른 화면과 공유하는 전역 store(use-checklist-store.ts)는 여전히 구 mock(TODO_SUMMARY_MOCK)
// 기반이라 여기서는 쓰지 않는다 — 실 API의 id(숫자)와 mock의 id(문자열 슬러그)가 서로 달라
// 지금 연결하면 MY 탭의 "오늘의 투두 n/5"가 오히려 깨진다(이 화면 자체 상태로만 관리).
//
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링).
// 캔버스는 402x874 고정 프레임(overflow:hidden)이라 세로 스케일도 함께 계산하고,
// 그래도 짧은 기기에서 남는 여백은 기존처럼 ScrollView로 감싸 안전하게 처리한다.

const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

// "오늘은 피하세요" 상세 모달 하단 멘트 — API에 없는 고정 CTA 문구(항목마다 다른 데이터가 아니라
// 화면 자체의 안내 문구라 상수로 둔다).
const AVOID_MODAL_FOOTER = '피부를 위해 피해주세요.';

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type TodoScreenState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_sleep_data'; message: string | null }
  | { status: 'no_recommendations'; message: string | null }
  | { status: 'available'; avoidItems: TodoAvoidItem[]; checklistItems: TodoChecklistItem[] };

// TODO-01 최상단 요약 멘트 — 서버가 문구를 내려주지 않으므로 데이터 유무에 따라 프론트가 직접
// 고른다. 세 문구 모두 이 함수 하나로 관리해 empty-state 본문과 최상단 서브헤딩이 항상 같은
// 말을 하도록 맞춘다.
function buildTodoSummaryMessage(state: TodoScreenState): string | null {
  switch (state.status) {
    case 'available':
      return '오늘의 피부를 위한 미션';
    case 'no_sleep_data':
      return state.message ?? '수면 데이터를 동기화해주세요';
    case 'no_recommendations':
      return state.message ?? '오늘은 특별히 관리할 항목이 없어요! 완벽합니다!';
    default:
      return null;
  }
}

function ChecklistRow({
  item,
  checked,
  pending,
  onToggle,
}: {
  item: TodoChecklistItem;
  checked: boolean;
  /** PATCH 응답 대기 중인 항목 — 중복 탭으로 인한 경쟁 요청을 막고, 대기 중임을 옅게 보여준다 */
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={pending}
      style={({ pressed }) => [
        styles.checklistItem,
        checked ? styles.checklistItemChecked : styles.checklistItemUnchecked,
        pressed && styles.pressed,
        pending && styles.checklistItemPending,
      ]}>
      <View style={styles.checkboxSlot}>
        <View style={[styles.checkbox, checked ? styles.checkboxChecked : styles.checkboxUnchecked]}>
          {checked && <ThemedText style={styles.checkmark}>✓</ThemedText>}
        </View>
      </View>
      <ThemedText style={[styles.checklistItemTitle, checked && styles.checklistItemTitleChecked]}>
        {item.title}
      </ThemedText>
    </Pressable>
  );
}

// "오늘은 피하세요" 항목 상세 모달 — Figma 'Ui (복사)' 파일 노드 541:3131(카드 그룹, 소속 프레임
// "iPhone 17 - 8" #541:3068 원점 기준 x:26 y:137)을 그대로 옮긴 것. 일간 리포트의
// SleepScoreGamificationModal과 동일한 패턴(402x874 고정 캔버스 + useDesignScale + Modal 백드롭)을
// 쓴다. 예전엔 mockData.ts의 rankLabel/description/footer 3개 필드를 썼지만, 실제 API는
// causeLabel + reason 2개뿐이라(footer 같은 고정 CTA는 AVOID_MODAL_FOOTER 상수로 대체) 그에 맞게
// 필드를 줄였다.
const AVOID_MODAL_CONTENT_WIDTH = 273;

// 제목 글자 크기를 항목 길이에 맞춰 계산한다. RN의 adjustsFontSizeToFit/minimumFontScale은
// react-native-web(이 프로젝트의 셀피 웹 테스트 환경)에서 동작하지 않아 — numberOfLines={1}만
// 적용되고 실제 축소는 무시돼 그대로 "..."로 잘렸다 — 웹/네이티브 모두 동작하도록 순수 JS로
// 직접 계산한다.
function getAvoidModalTitleFontSize(title: string): number {
  const fittedSize = Math.floor(AVOID_MODAL_CONTENT_WIDTH / (title.length * 1.15));
  return Math.max(14, Math.min(25, fittedSize));
}

function AvoidDetailModal({ item, onClose }: { item: TodoAvoidItem | null; onClose: () => void }) {
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [fontsLoaded] = useFonts(AVOID_DETAIL_FONTS);
  const visible = item !== null;

  if (!visible || !fontsLoaded || !item) return null;

  const titleFontSize = getAvoidModalTitleFontSize(item.title);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.avoidModalBackdrop} onPress={onClose}>
        <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <View style={[styles.avoidModalCanvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
            <Pressable style={styles.avoidModalCard} onPress={() => {}}>
              <View style={styles.avoidModalBadge}>
                <Text style={styles.avoidModalBadgeText}>오늘은 피하세요</Text>
              </View>

              <Text style={[styles.avoidModalTitle, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.2 }]}>
                {item.title}
              </Text>

              {/* causeLabel(원인 태그) — 예전 rankLabel 자리 */}
              <Text style={styles.avoidModalRankLabel}>{item.causeLabel}</Text>

              {/* reason(롱프레스 설명) — 예전 description 자리, 행잉 인덴트 동일 유지 */}
              <View style={styles.avoidModalDescriptionRow}>
                <Text style={styles.avoidModalDescriptionDash}>-</Text>
                <Text style={styles.avoidModalDescriptionText}>{item.reason}</Text>
              </View>

              <Text style={styles.avoidModalFooter}>{AVOID_MODAL_FOOTER}</Text>
            </Pressable>

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
  const [state, setState] = useState<TodoScreenState>({ status: 'loading' });
  const [selectedAvoidItem, setSelectedAvoidItem] = useState<TodoAvoidItem | null>(null);
  // 체크리스트만 별도 state로 들고 있는다 — PATCH 성공/실패에 따라 개별 항목의 status를 그때그때
  // 덮어써야 해서(낙관적 업데이트 → 서버 값으로 확정, 또는 실패 시 되돌리기) state의 'available'
  // 케이스 안에 얼려두지 않는다. avoidItems는 토글 대상이 아니라 계속 state에서 파생해서 쓴다.
  const [checklistItems, setChecklistItems] = useState<TodoChecklistItem[]>([]);
  // 지금 PATCH 응답을 기다리는 항목 id — 중복 탭 방지 + 대기 중 시각 표시용.
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // gained !== 0일 때만 채워진다(HOME-04와 공유하는 ExpGainPopup에 그대로 넘긴다).
  const [expPopup, setExpPopup] = useState<AttendanceExpInfo | null>(null);

  useEffect(() => {
    getDailyTodos(getTodayDateString(), TEMP_USER_ID)
      .then(({ data }) => {
        if (data.status === 'NO_SLEEP_DATA') {
          setState({ status: 'no_sleep_data', message: data.message });
          return;
        }
        // AVAILABLE인데 두 배열이 모두 비어 있으면 "처방할 게 없는 날"(케이스 B) — 예보가 없는
        // 케이스 A(NO_SLEEP_DATA)와 문구를 절대 섞지 않는다.
        if (data.avoidItems.length === 0 && data.checklistItems.length === 0) {
          setState({ status: 'no_recommendations', message: data.message });
          return;
        }
        setState({ status: 'available', avoidItems: data.avoidItems, checklistItems: data.checklistItems });
        setChecklistItems(data.checklistItems);
      })
      .catch(() => setState({ status: 'error' }));
  }, []);

  const avoidItems = state.status === 'available' ? state.avoidItems : [];

  const completed = useMemo(() => checklistItems.filter((item) => item.status === 'DONE').length, [checklistItems]);
  const total = checklistItems.length;
  const progress = total === 0 ? 0 : completed / total;

  const summaryMessage = buildTodoSummaryMessage(state);

  async function handleToggle(item: TodoChecklistItem) {
    if (pendingId !== null) return;

    const previousStatus = item.status;
    const nextStatus: TodoChecklistItem['status'] = previousStatus === 'DONE' ? 'PENDING' : 'DONE';

    // 낙관적 업데이트 — 응답을 기다리지 않고 먼저 화면을 바꿔 대기가 어색하지 않게 한다.
    setChecklistItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it)));
    setPendingId(item.id);
    setToggleError(null);

    try {
      const { data } = await updateTodoStatus(item.id, nextStatus, TEMP_USER_ID);
      // 서버가 돌려준 진짜 status로 다시 덮어쓴다 — 낙관적 값과 다를 일은 거의 없지만 서버가 최종 진실.
      setChecklistItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: data.status } : it)));
      // exp는 상태가 "실제로" 바뀔 때만 움직인다 — gained가 0(같은 상태 재요청 등)이면 아무것도 안 띄운다.
      // gained가 음수(되돌리기로 인한 회수)여도 정상 케이스이므로 부호와 무관하게 0이 아니면 띄운다.
      if (data.exp.gained !== 0) {
        setExpPopup(data.exp);
      }
    } catch (error) {
      // 실패 시 낙관적 업데이트를 되돌린다.
      setChecklistItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: previousStatus } : it)));
      if (error instanceof TodoActionApiError && error.code === 'ACTION_NOT_CHECKABLE') {
        setToggleError('이 항목은 체크할 수 없어요');
      } else {
        setToggleError('상태 변경에 실패했어요');
      }
    } finally {
      setPendingId(null);
    }
  }

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

            {(state.status === 'loading' || state.status === 'error') && (
              <ThemedText style={styles.statusText}>
                {state.status === 'loading' ? '불러오는 중...' : '투두 목록을 불러오지 못했어요'}
              </ThemedText>
            )}

            {/* 두 가지 빈 상태(케이스 A/B) — 서로 다른 문구로 각각 렌더링한다. 진행도/카드/체크리스트는
                보여줄 데이터가 없으므로 아예 그리지 않는다. */}
            {(state.status === 'no_sleep_data' || state.status === 'no_recommendations') && (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyStateText}>{summaryMessage}</ThemedText>
              </View>
            )}

            {state.status === 'available' && (
              <>
                {/* TODO-01 요약 멘트 — 서버가 안 주므로 프론트가 직접 렌더링 */}
                <ThemedText style={styles.summarySubtitle}>{summaryMessage}</ThemedText>

                {checklistItems.length > 0 && (
                  <>
                    {/* "진행도" + 진행 바 + "n/total" (node 176:1229~1232) — DONE 개수는 서버가
                        내려주지 않아 checklistItems를 순회하며 프론트가 직접 센다. */}
                    <ThemedText style={styles.progressLabel}>진행도</ThemedText>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                    <ThemedText style={styles.progressCount}>
                      {completed}/{total}
                    </ThemedText>
                    {toggleError && <ThemedText style={styles.toggleErrorText}>{toggleError}</ThemedText>}
                  </>
                )}

                {avoidItems.length > 0 && (
                  <View style={styles.avoidCard}>
                    <ThemedText style={styles.avoidTitle}>오늘은 피하세요</ThemedText>
                    <View style={styles.avoidList}>
                      {avoidItems.map((item) => (
                        <Pressable
                          key={item.id}
                          onLongPress={() => setSelectedAvoidItem(item)}
                          delayLongPress={350}
                          style={({ pressed }) => [styles.avoidItem, pressed && styles.pressed]}>
                          <ThemedText style={styles.avoidItemTitle}>{item.title}</ThemedText>
                          <View style={styles.avoidItemCauseTag}>
                            <ThemedText style={styles.avoidItemCauseTagText}>{item.causeLabel}</ThemedText>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {checklistItems.length > 0 && (
                  <>
                    <ThemedText style={styles.checklistTitle}>오늘 밤 체크리스트</ThemedText>
                    <View style={styles.checklistList}>
                      {checklistItems.map((item) => (
                        <ChecklistRow
                          key={item.id}
                          item={item}
                          checked={item.status === 'DONE'}
                          pending={pendingId === item.id}
                          onToggle={() => handleToggle(item)}
                        />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <AvoidDetailModal item={selectedAvoidItem} onClose={() => setSelectedAvoidItem(null)} />
      {expPopup && <ExpGainPopup exp={expPopup} onClose={() => setExpPopup(null)} />}
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

  // 로딩/에러 상태 텍스트 — Figma 노드 없음, 타이틀 아래 여백에 얹는다.
  statusText: {
    position: 'absolute',
    left: 27,
    top: 110,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // 두 빈 상태(NO_SLEEP_DATA / AVAILABLE+빈 배열) 공용 안내 블록 — Figma 노드 없음.
  emptyState: {
    position: 'absolute',
    left: 27,
    top: 130,
    width: 348,
  },
  emptyStateText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // TODO-01 요약 멘트("오늘의 피부를 위한 미션") — 서버가 안 주는 문구라 Figma 고정 노드가 없다.
  // 타이틀 바로 아래, 진행도 줄 위에 얹는다.
  summarySubtitle: {
    position: 'absolute',
    left: 27,
    top: 100,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },

  // "진행도" (node 176:1229, x:78 y:107 w:103 h:17)
  progressLabel: {
    position: 'absolute',
    left: 78,
    top: 122,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#383838',
  },
  // 진행 트랙 배경 value (node 176:1230, x:127 y:113 w:95 h:7, radius:6)
  progressTrack: {
    position: 'absolute',
    left: 127,
    top: 128,
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
    top: 124,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: '#000000',
  },
  // PATCH 실패 안내 — Figma 노드 없음, 진행도 줄 아래 여백에 얹는다. 다음 토글 시도에서 지워진다.
  toggleErrorText: {
    position: 'absolute',
    left: 78,
    top: 140,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: '#E52222',
  },

  // "div" 오늘은 피하세요 카드 (node 187:2505, x:9 y:125 w:400 h:216, radius:16)
  avoidCard: {
    position: 'absolute',
    left: 9,
    top: 150,
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
    gap: 6,
  },
  // (node 187:2516/187:2521, w:338 h:18)
  avoidItemTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#171717',
  },
  // causeLabel 태그 — 예전엔 캡션 텍스트 한 줄이었지만, API가 명확히 "태그"로 규정한 필드라
  // 배지 모양으로 감싼다(롱프레스로 더 긴 reason을 볼 수 있다는 걸 시각적으로도 암시).
  avoidItemCauseTag: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 66, 66, 0.1)',
  },
  avoidItemCauseTagText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: '#E52222',
  },

  // "오늘 밤 체크리스트" (node 432:1157, x:18 y:431 w:363)
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
  // PATCH 응답 대기 중인 항목 — 낙관적으로 이미 바뀐 상태를 보여주되, 처리 중임을 옅게 티 낸다.
  checklistItemPending: {
    opacity: 0.55,
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
  // DONE 항목은 취소선으로 완료를 표시한다(체크박스 색만으로는 스크롤 중 눈에 덜 띄어서 보강).
  checklistItemTitleChecked: {
    textDecorationLine: 'line-through',
    color: 'rgba(23, 23, 23, 0.55)',
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
  // 자식을 쌓는다(제목이 몇 줄이 되든 뒤 요소가 항상 그 아래로 자연스럽게 밀려나도록).
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
  // "오늘은 피하세요" 배지 (node 541:3135, w:136 h:33, fill #407AF7, radius:16)
  avoidModalBadge: {
    width: 136,
    height: 33,
    backgroundColor: '#407AF7',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avoidModalBadgeText: {
    fontSize: 17,
    fontFamily: PRETENDARD_MEDIUM,
    color: '#FFFFFF',
  },
  avoidModalTitle: {
    marginTop: 18,
    width: AVOID_MODAL_CONTENT_WIDTH,
    fontFamily: PRETENDARD_BOLD,
    color: '#171717',
  },
  // causeLabel 위치 (예전 rankLabel 자리, node 541:3137, Pretendard SemiBold 21px, lineHeight:27px)
  avoidModalRankLabel: {
    marginTop: 10,
    fontSize: 21,
    lineHeight: 27,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#3270F5',
  },
  // reason 위치 (예전 description 자리, node 541:3138, Pretendard Medium 21px, lineHeight:31px) —
  // "-"와 문장을 좌우로 나눠, 문장이 줄바꿈돼도 항상 "-" 오른쪽 열에서 시작하게 한다(행잉 인덴트).
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
  // 하단 멘트 (node 541:3139, Pretendard Light 17px, lineHeight:21px, 중앙 정렬)
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
