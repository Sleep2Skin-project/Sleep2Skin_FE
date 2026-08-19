import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getDailyTodos,
  TodoActionApiError,
  updateTodoStatus,
  type TodoAvoidItem,
  type TodoChecklistItem,
} from '@/api/todo';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { useDesignScale } from '@/hooks/use-design-scale';
import { signalTodoChanged } from '@/hooks/use-todo-changed-signal';

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

// 체크리스트 행 옆 "+5 exp" 배지(node 694:2610) 전용 픽셀 폰트 — 홈 화면(index.tsx)의
// "50/250 exp"와 같은 폰트/패턴이다.
const PRESS_START_2P = 'PressStart2P-Regular';
const TODO_PIXEL_FONTS = {
  [PRESS_START_2P]: require('@/assets/fonts/PressStart2P-Regular.ttf'),
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
// exp가 실제로 움직였을 때(gained !== 0, 플러스든 마이너스든)만 그 항목 옆에 "+N exp"를 잠깐
// 띄운다(ExpChangeBadge) — 예전엔 화면 전체를 덮는 ExpGainPopup(HOME-04 출석 체크인과 공유하던
// 모달)을 썼지만, Figma 시안(node 694:2610)이 체크한 행 옆에 작게 표시하는 방식이라 이 화면에서만
// 그 팝업 대신 인라인 배지로 바꿨다 — 다른 화면(HOME-04 등)은 여전히 ExpGainPopup을 그대로 쓴다.
// 이 화면의 checklistItems 자체는 여전히 이 화면 상태로만 관리한다(HOME/MY와 형태가 다른 화면
// 전용 파생값이 많아 그대로 공유하기엔 안 맞음, 실 API의 id(숫자)와 다른 화면의 id 체계가 다를
// 수도 있어서 더더욱). 다만 토글이 성공하면 signalTodoChanged()로 HOME(레벨/exp)과 MY(exp 바·
// 오늘의 투두 n/5)에 "다시 조회해라"만 알린다(use-todo-changed-signal.ts).
//
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링). 아이폰 16
// 한 기기로 고정한 뒤로는 스크롤(예전엔 ScrollView로 감쌌었다)도 없앴다 — 스크롤바 없이
// 한 화면에 다 들어오는 쪽을 선호해서, 아래 요소 좌표들을 화면 위쪽 여백을 줄이는 방향으로
// 다시 잡았다(홈 화면 index.tsx와 같은 방식, SCALE_FIT_HEIGHT 관련 주석 참고).

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

// "+5 exp" 인라인 배지(node 694:2610) — 체크한 항목마다 각자 하나씩 뜬다(가장 최근 것만 남는 게
// 아니다). 체크 해제하면 그 항목의 배지만 즉시 사라진다(TodoScreen이 항목별로 map에 담아뒀다가
// 해제 시 그 항목 것만 지운다) — "-N exp"는 따로 보여주지 않는다. 마운트될 때 한 번 스프링으로
// 튀어 오르듯 나타난 뒤 그대로 유지되고, 언마운트(=체크 해제)되면 사라지는 것 자체가 곧 애니메이션
// 종료라 별도 페이드아웃/onDone 콜백은 필요 없다.
function ExpGainBadge({ amount }: { amount: number }) {
  const [scale] = useState(() => new Animated.Value(0.4));
  const [translateY] = useState(() => new Animated.Value(6));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      // friction을 낮고 tension을 높게 잡아 1을 살짝 넘겼다가 튕기듯 돌아오게 한다("통통 튀는" 느낌).
      Animated.spring(scale, { toValue: 1, friction: 3.5, tension: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    // 마운트 시 1회만 재생 — 이 컴포넌트는 항목이 체크될 때만 마운트되고, 해제되면 그대로
    // 언마운트되므로 재생을 다시 트리거할 의존성이 필요 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.Text
      style={[styles.expBadgeText, { opacity, transform: [{ scale }, { translateY }] }]}
      numberOfLines={1}>
      +{amount} exp
    </Animated.Text>
  );
}

function ChecklistRow({
  item,
  checked,
  pending,
  expGained,
  onToggle,
}: {
  item: TodoChecklistItem;
  checked: boolean;
  /** PATCH 응답 대기 중인 항목 — 중복 탭으로 인한 경쟁 요청을 막고, 대기 중임을 옅게 보여준다 */
  pending: boolean;
  /** 이 항목에 지금 표시 중인 exp 배지 값 — 없으면 null(TodoScreen이 항목 id로 걸러서 넘긴다) */
  expGained: number | null;
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
      {expGained !== null && <ExpGainBadge amount={expGained} />}
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
      {/* 백드롭을 flexbox로 화면 전체를 감싸고 중앙 정렬 — 예전엔 카드를 402x874 캔버스 기준
          절대좌표(left:26 top:229)로 찍어서 화면 좌측 상단에 치우쳐 보였다. 카드 자체의
          크기(width/padding 등)는 그대로 두고 배치 방식만 바꿨다. */}
      <Pressable style={styles.avoidModalBackdrop} onPress={onClose}>
        <View style={{ transform: [{ scale }] }}>
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

            {/* 닫기 버튼 — 카드를 절대좌표 캔버스가 아니라 카드 자신을 기준으로 위치시키도록
                카드 내부로 옮겼다(카드 위 상대 위치는 이전과 동일하게 유지). */}
            <Pressable onPress={onClose} hitSlop={12} style={styles.avoidModalCloseButton}>
              <Image
                source={require('@/assets/images/figma-icon-avoid-detail-close.svg')}
                style={styles.avoidModalCloseIcon}
                contentFit="contain"
              />
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function TodoScreen() {
  // 하단 네이티브 탭바가 실제로 차지하는 높이는 useSafeAreaInsets()로 알 수 없어(홈 화면
  // index.tsx의 SafeAreaView onLayout과 같은 이유 — 852 고정값 기준으로 계산하면 탭바 높이를
  // 반영 못 해 필요 이상으로 작게 그려진다), SafeAreaView 자신의 렌더링 높이를 onLayout으로
  // 직접 재서 넘긴다.
  const [screenHeight, setScreenHeight] = useState<number>();
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT, screenHeight);
  const [pixelFontLoaded] = useFonts(TODO_PIXEL_FONTS);
  const [state, setState] = useState<TodoScreenState>({ status: 'loading' });
  const [selectedAvoidItem, setSelectedAvoidItem] = useState<TodoAvoidItem | null>(null);
  // 체크리스트만 별도 state로 들고 있는다 — PATCH 성공/실패에 따라 개별 항목의 status를 그때그때
  // 덮어써야 해서(낙관적 업데이트 → 서버 값으로 확정, 또는 실패 시 되돌리기) state의 'available'
  // 케이스 안에 얼려두지 않는다. avoidItems는 토글 대상이 아니라 계속 state에서 파생해서 쓴다.
  const [checklistItems, setChecklistItems] = useState<TodoChecklistItem[]>([]);
  // 지금 PATCH 응답을 기다리는 항목 id — 중복 탭 방지 + 대기 중 시각 표시용.
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // 체크된 항목마다 하나씩 쌓인다(itemId → 받은 exp) — 체크한 항목 전부가 동시에 각자 배지를
  // 보여줘야 해서(가장 최근 것만 남기지 않는다) 단일 값이 아니라 맵으로 관리한다. 체크 해제하면
  // handleToggle이 그 항목 것만 지운다. 여기 담기는 값은 항상 TODO_DONE 몫(보통 5)만이다 —
  // 마지막 한 칸을 채워 전체 완료 보너스(TODO_ALL_DONE)까지 함께 받아도(gained가 35처럼 합산된
  // 값으로 와도) 그 항목 배지엔 5만 보여주고, 보너스는 아래 allDoneBonusAmount로 따로 뗀다.
  const [expByItemId, setExpByItemId] = useState<Record<number, number>>({});
  // "오늘 밤 체크리스트" 제목 옆 전체 완료 보너스(node 없음, 신규 연출) — 지금 이 순간 checklistItems가
  // 전부 DONE일 때만(allChecklistDone, 아래 useMemo) 보여준다. 값 자체(TODO_ALL_DONE 보상액,
  // 보통 30)는 checklistItems만 봐서는 알 수 없어(서버가 이 GET엔 exp를 안 준다) 마지막 토글
  // 응답의 exp.reasons에서 딱 한 번 받아 저장해둔다 — 전체 완료가 아닌 상태로 바뀌면(하나라도
  // 해제) null로 지운다. 처음 화면을 열었을 때 이미 전부 체크돼 있던 경우엔 이번 세션에서 받은
  // "보상"이 아니므로 굳이 값을 추측해서 보여주지 않는다(allChecklistDone은 true여도 이 값이
  // null이면 배지 자체를 렌더링하지 않는다).
  const [allDoneBonusAmount, setAllDoneBonusAmount] = useState<number | null>(null);

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
  // checklistItems에서 그대로 파생한다(별도 state로 안 둔다) — 낙관적 업데이트로 checklistItems가
  // 바뀌는 즉시 같이 따라와서, 서버 응답을 기다리지 않고도 항상 "지금 화면에 보이는 상태"와
  // 정확히 일치한다.
  const allChecklistDone = total > 0 && completed === total;

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

      // HOME(레벨/exp)과 MY(exp 바·오늘의 투두 n/5)에 이 화면의 변경을 알린다 — 두 화면 다
      // 마운트 시 한 번만 조회해서 그대로 두면 탭을 옮겨도 갱신되지 않는다(use-todo-changed-signal.ts).
      signalTodoChanged();

      // 체크(PENDING→DONE)했을 때만 그 항목에 배지를 추가한다. exp.gained를 그대로 쓰지 않고
      // reasons에서 TODO_DONE 몫만 뽑는다 — 마지막 칸이라 전체 완료 보너스(TODO_ALL_DONE)까지
      // 합쳐 35로 와도 이 항목엔 5만 보여주고 30은 아래에서 제목 줄 배지로 따로 뗀다.
      // 체크 해제(DONE→PENDING)는 "-N exp"를 보여주지 않고 그 항목의 배지를 그냥 지운다.
      if (data.status === 'DONE') {
        const doneAmount = data.exp.reasons.find((r) => r.reason === 'TODO_DONE')?.amount;
        if (doneAmount) {
          setExpByItemId((prev) => ({ ...prev, [item.id]: doneAmount }));
        }
      } else {
        setExpByItemId((prev) => {
          if (!(item.id in prev)) return prev;
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }

      // 전체 완료 보너스(TODO_ALL_DONE) — data.allCompleted는 "지금 이 순간 전부 DONE인가"를
      // 서버가 직접 알려주는 값이라 그대로 신뢰한다. true면 이번 응답의 reasons에서 보너스 액수를
      // 뽑아 저장하고(이 토글로 막 전체 완료됐을 때만 reasons에 TODO_ALL_DONE이 실제로 들어있다),
      // false면(하나라도 해제됐다는 뜻) 무조건 지운다.
      if (data.allCompleted) {
        const bonusAmount = data.exp.reasons.find((r) => r.reason === 'TODO_ALL_DONE')?.amount;
        if (bonusAmount) setAllDoneBonusAmount(bonusAmount);
      } else {
        setAllDoneBonusAmount(null);
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
    <SafeAreaView
      style={styles.screen}
      edges={['top', 'left', 'right']}
      onLayout={(e) => setScreenHeight(e.nativeEvent.layout.height)}>
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
                {avoidItems.length > 0 && (
                  <View style={styles.avoidCard}>
                    <ThemedText style={styles.avoidTitle}>오늘은 피하세요</ThemedText>
                    <View style={styles.avoidList}>
                      {avoidItems.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => setSelectedAvoidItem(item)}
                          style={({ pressed }) => [styles.avoidItem, pressed && styles.pressed]}>
                          <ThemedText style={styles.avoidItemTitle}>{item.title}</ThemedText>
                          <ThemedText style={styles.avoidItemCauseText}>{item.causeLabel}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {checklistItems.length > 0 && (
                  <>
                    <View style={styles.checklistTitleRow}>
                      <ThemedText style={styles.checklistTitle}>오늘 밤 체크리스트</ThemedText>
                      {allChecklistDone && allDoneBonusAmount !== null && pixelFontLoaded && (
                        <ExpGainBadge amount={allDoneBonusAmount} />
                      )}
                    </View>

                    {/* "진행도" + 진행 바 + "n/total" (node 176:1229~1232) — DONE 개수는 서버가
                        내려주지 않아 checklistItems를 순회하며 프론트가 직접 센다. "오늘 밤
                        체크리스트" 제목 바로 아래로 이동(원래는 페이지 상단에 있었음). */}
                    <ThemedText style={styles.progressLabel}>진행도</ThemedText>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                    <ThemedText style={styles.progressCount}>
                      {completed}/{total}
                    </ThemedText>
                    {toggleError && <ThemedText style={styles.toggleErrorText}>{toggleError}</ThemedText>}

                    <View style={styles.checklistList}>
                      {checklistItems.map((item) => (
                        <ChecklistRow
                          key={item.id}
                          item={item}
                          checked={item.status === 'DONE'}
                          pending={pendingId === item.id}
                          expGained={pixelFontLoaded ? (expByItemId[item.id] ?? null) : null}
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

      <AvoidDetailModal item={selectedAvoidItem} onClose={() => setSelectedAvoidItem(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 🚨 스크롤(ScrollView)을 없앴다 — 원래는 useDesignScale이 못 맞추는 짧은 기기를 위한
  // 안전장치로 감싸뒀었는데, 스크롤바 자체가 안 보이는 쪽을 선호해서(아이폰16 한 기기로
  // 고정한 이상 굳이 스크롤로 도피할 필요가 없다) 뺐다. 캔버스가 화면에 안 들어가면 이제
  // 스크롤 대신 아래쪽이 그대로 잘리니, 하단 요소 좌표를 바꾸면 실기기에서 꼭 확인한다.
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

  // Spiral Notepad (node 694:2659, x:22.04 y:70 w:31 h:31) — 예전엔 다른(구) 프레임 노드(187:2551)
  // 좌표를 썼는데 새 시안(694:2599)과 5px 정도 어긋나 있었다.
  notepadIcon: {
    position: 'absolute',
    left: 22,
    top: 55,
    width: 31,
    height: 31,
  },
  // "오늘의 투두리스트" (node 694:2622, x:66.04 y:70 w:168 h:26)
  // 🚨 fontSize/lineHeight/fontWeight가 홈 화면(index.tsx) "좋은 아침이에요"(greetingText)와
  // 완전히 같다(25/35/700) — 그것과 같은 볼드체·크기로 맞춰달라는 요청.
  pageTitle: {
    position: 'absolute',
    left: 66,
    top: 55,
    fontSize: 25,
    lineHeight: 35,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // ghost2-transparent 1 (node 187:2526, x:309 y:55 w:89 h:89)
  // 🚨 1.2배(89→107) 키웠다 — 가운데(원래 중심 x=353.5, y=84.5)는 그대로 유지하도록
  // left/top도 같이 다시 계산했다.
  ghostImage: {
    position: 'absolute',
    left: 291,
    top: 31,
    width: 107,
    height: 107,
  },

  // 로딩/에러 상태 텍스트 — Figma 노드 없음, 타이틀 아래 여백에 얹는다.
  statusText: {
    position: 'absolute',
    left: 27,
    top: 95,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // 두 빈 상태(NO_SLEEP_DATA / AVAILABLE+빈 배열) 공용 안내 블록 — Figma 노드 없음.
  emptyState: {
    position: 'absolute',
    left: 27,
    top: 115,
    width: 348,
  },
  emptyStateText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    color: 'rgba(55, 56, 60, 0.61)',
  },
  // "진행도" — "오늘 밤 체크리스트" 섹션(제목+진행도 바+체크리스트 5개, checklistTitleRow
  // 기준) 전체를 한 그룹으로 위로 18px 당겼다(top:458→440) — 위 "오늘은 피하세요" 카드 3개는
  // 전혀 안 건드리고, 이 그룹만 통째로 이동. 그룹 내부 상대 간격(제목-진행도-체크리스트
  // 사이 간격)은 전부 그대로 유지.
  progressLabel: {
    position: 'absolute',
    left: 21,
    top: 425,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    color: '#383838',
  },
  // 진행 트랙 배경 value — progressLabel과 같이 18px 위로 이동(top 464→446).
  progressTrack: {
    position: 'absolute',
    left: 70,
    top: 431,
    width: 95.4,
    height: 7,
    borderRadius: 6,
    backgroundColor: '#C2C2C2',
    overflow: 'hidden',
  },
  // 진행 트랙 채움 value (node 694:2626, 배경과 동일 위치, 너비만 progress로 동적 계산)
  progressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
  },
  // "1/5" — progressLabel과 같이 18px 위로 이동(top 460→442).
  progressCount: {
    position: 'absolute',
    left: 170,
    top: 427,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: '#000000',
  },
  // PATCH 실패 안내 — Figma 노드 없음, 진행도 줄 아래 여백에 얹는다. 다음 토글 시도에서 지워진다.
  // progressLabel과 같이 18px 위로 이동(top 492→474).
  toggleErrorText: {
    position: 'absolute',
    left: 26,
    top: 459,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    color: '#E52222',
  },

  // "div" 오늘은 피하세요 카드 (node 187:2505, x:9 y:125 w:400 h:216, radius:16)
  // 🚨 left/width가 원본(9/400)과 다르다 — 원본 그대로면 오른쪽 끝이 9+400=409로 캔버스 폭
  // (402)을 7pt 넘어가 있었다. 반면 체크리스트 쪽(checklistList, left:21 width:363, 오른쪽
  // 끝 384)은 안쪽에 여유 있게 들어와 있어서 두 섹션의 좌우 여백이 서로 달라 보였다. avoidItem
  // (width:363, 카드 padding 16 안쪽에 꽉 참)이 checklistItem과 정확히 같은 화면 좌표
  // (x:21~384)에 오도록 카드 자체를 left:9→5, width:400→395로 다시 잡았다(콘텐츠 폭 363 +
  // 양쪽 패딩 16씩 = 395, 오른쪽 끝 400으로 캔버스 안쪽에 정확히 들어옴).
  avoidCard: {
    position: 'absolute',
    left: 5,
    top: 95,
    width: 395,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  // "오늘은 피하세요" (node 187:2507, w:368 h:21)
  // 🚨 fontSize가 17이 아니라 20이다 — 홈 화면(index.tsx) "오늘의 피부 예보" 카드 제목
  // (forecastTitle)과 같은 크기로 맞췄다.
  avoidTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    color: '#FF4242',
  },
  avoidList: {
    gap: 8,
  },
  // 카드 (node 541:2952/2957/2962, w:368 h:71, radius:12, fill: rgba(255,255,255,0) — 배경이
  // 없어 avoidCard/화면 배경(#DFEAFF)이 그대로 비친다. 흰 배경(#FFFFFF)이 아니다.
  // 🚨 width/paddingVertical/borderRadius가 원본과 다르다(368→363, 13→15, 12→14) — 체크리스트
  // 박스(checklistItem)와 크기가 미묘하게 달라 보인다는 피드백으로, 그 세 값을 그대로 맞췄다.
  // 배경/테두리 색은 의도적으로 다르므로(투명 vs 반투명 흰색) 안 건드렸다.
  avoidItem: {
    width: 363,
    backgroundColor: 'rgba(255, 255, 255, 0)',
    borderWidth: 1,
    borderColor: 'rgba(112, 115, 124, 0.22)',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 15,
    gap: 6,
  },
  // (node 187:2516/187:2521, w:338 h:18)
  // 🚨 fontSize가 15가 아니라 17이다 — 박스 안 글씨를 전부 +2 키워달라는 요청.
  avoidItemTitle: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: '#171717',
  },
  // causeLabel 캡션 (node 694:2635 "혈색 저하의 원인" 등, Inter Regular 12.5px, lineHeight:18.75px,
  // Tuna 61%) — 이전엔 빨간 배지(태그) 모양이었는데 Figma엔 그런 배지가 없고, 제목 아래 옅은 회색
  // 캡션 한 줄일 뿐이다. 빨간색은 "오늘은 피하세요" 섹션 타이틀(avoidTitle)에서만 쓴다.
  // 🚨 fontSize가 12.5가 아니라 14.5다 — avoidItemTitle과 같은 이유로 +2.
  avoidItemCauseText: {
    fontSize: 14.5,
    lineHeight: 20.75,
    fontWeight: '400',
    color: 'rgba(55, 56, 60, 0.61)',
  },

  // "오늘 밤 체크리스트" 줄 (node 432:1157, x:18 y:431 w:363) — "오늘 밤 체크리스트" 섹션
  // 그룹(제목+진행도 바+체크리스트) 전체를 18px 위로 당겨 top:431→413. 위 "오늘은 피하세요"
  // 카드 3개(avoidCard, top:110)와 그 사이 여백은 전혀 안 건드렸다 — 세 번째 카드 밑과 이
  // 줄 사이 간격만 좁아진 것.
  checklistTitleRow: {
    position: 'absolute',
    left: 21,
    top: 398,
    width: 363,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // 🚨 fontSize가 16이 아니라 20이다 — avoidTitle과 같은 이유로 홈 화면 forecastTitle과 맞췄다.
  checklistTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    color: '#171717',
  },
  // 항목 리스트 (node 432:1158, w:363, gap:10) — 그룹 전체 이동과 같이 18px 위로(top 486→468).
  checklistList: {
    position: 'absolute',
    left: 21,
    top: 453,
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
  // 배경색은 HOME 화면(index.tsx)의 "오늘의 피부 예보" 카드(forecastCard)와 동일한
  // rgba(255,255,255,0.62)로 통일했다(원래 불투명 #FFFFFF였음).
  checklistItemUnchecked: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
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
  // 🚨 fontSize가 15가 아니라 17이다 — avoidItemTitle과 같은 +2 요청.
  checklistItemTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: '#171717',
  },
  // DONE 항목 제목 색상 — Figma(node 694:2609)는 체크 여부와 무관하게 제목을 항상 Cod Gray로
  // 그린다. 취소선은 없다(예전엔 넣었었는데 Figma에 없는 연출이라 뺐다).
  checklistItemTitleChecked: {
    color: 'rgba(23, 23, 23, 0.55)',
  },
  // "+5 exp" 배지 (node 694:2610, Press Start 2P 12px, #3366FF) — ExpChangeBadge가 opacity/scale/
  // translateY를 애니메이션으로 얹는다. flexShrink:0으로 옆 제목(flex:1)이 줄어들어도 이 텍스트
  // 자체는 안 눌리게 한다.
  expBadgeText: {
    flexShrink: 0,
    fontSize: 12,
    fontFamily: PRESS_START_2P,
    color: Colors.accentBlue,
  },

  // ── AvoidDetailModal (node 541:3131) ────────────────────────────────────
  // 백드롭 (node 541:3130, rgba(255,255,255,0.4)) — justifyContent/alignItems로 카드를 화면
  // 정중앙에 띄운다(예전엔 캔버스 절대좌표라 좌측 상단에 치우쳐 보였다).
  avoidModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 카드 (node 541:3134, w:347, radius:30, border 2px #3060EA) — 세로 flex 컬럼으로 자식을
  // 쌓는다(제목이 몇 줄이 되든 뒤 요소가 항상 그 아래로 자연스럽게 밀려나도록). 크기/패딩은
  // 그대로 유지하고, 절대좌표(position:absolute, left:26 top:229) 배치만 제거했다 — 이제
  // avoidModalBackdrop의 flex 중앙 정렬을 따르는 일반 자식이다.
  avoidModalCard: {
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
  // 닫기 버튼 (node 541:3142, w:20 h:19, #407AF7) — 이제 avoidModalCard 안쪽으로 옮겨서, 카드
  // 기준 상대좌표(예전 절대좌표 left:322/top:265에서 카드의 left:26/top:229를 뺀 값)로 잡았다 —
  // 카드 위에서의 위치는 이전과 완전히 동일하다.
  avoidModalCloseButton: {
    position: 'absolute',
    left: 296,
    top: 36,
  },
  avoidModalCloseIcon: {
    width: 20,
    height: 19,
  },
});
