import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateRemainingExp, checkInAttendance, getLevelExpDisplay, type AttendanceWeekDay } from '@/api/game';
import { getDailyTodos } from '@/api/todo';
import {
  calculateVerificationTrustLevel,
  deleteUserMe,
  getDataStatus,
  getUserMe,
  type UserMeData,
} from '@/api/user';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { LEVEL_CHARACTER_IMAGES, LEVEL_EXP_MAX } from '@/constants/mockData';
import { signalAccountDeleted } from '@/hooks/use-account-reset-signal';
import { useDesignScale } from '@/hooks/use-design-scale';
import { useTodoChangedSignal } from '@/hooks/use-todo-changed-signal';

// MY — Figma 'Ui (복사)' 파일 노드 541:2981("iPhone 17 - 22")를 Figma REST API로 직접 읽어와
// index.tsx(홈 화면)와 동일하게 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것.
// 좌표는 모두 프레임(node 541:2981) 원점 기준 절대값. Figma가 그려둔 하단 "Tab Bar" 인스턴스는
// 실제 앱에서 렌더하지 않는다 — 진짜 탭 바는 expo-router NativeTabs(app-tabs.tsx)가 담당한다
// (index.tsx/todo.tsx도 동일한 이유로 Figma의 Tab Bar를 그리지 않는다).
//
// 우상단 톱니바퀴(설정) 아이콘(node 541:3039)을 누르면 /my-model(my-model.tsx, 기존에 이
// 파일에 있던 "내 모델" 화면)로 이동한다 — 사용자가 "설정 버튼 누르면 그 페이지로 넘어가게
// 해달라"고 명시적으로 요청함. 처음엔 RN Modal로 띄웠는데 웹(react-native-web)에서 탭해도
// 바로 안 뜨는 문제가 있어 실제 라우트(페이지)로 바꿨다 — 자세한 사정은 my-model.tsx 상단
// 주석 참고. 아직 이 아이콘 자체를 위한 별도 설정 화면 디자인은 없다(추후 사용자가 전달
// 예정) — 그때 진짜 "설정" 화면이 생기면 이 아이콘의 동작을 그쪽으로 바꾸고, "내 모델"은 그
// 설정 화면 안의 항목 하나로 옮기면 된다.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

const PRETENDARD_LIGHT = 'Pretendard-Light';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const PRESS_START_2P = 'PressStart2P-Regular';
const MY_SCREEN_FONTS = {
  [PRETENDARD_LIGHT]: require('@/assets/fonts/Pretendard-Light.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
  [PRESS_START_2P]: require('@/assets/fonts/PressStart2P-Regular.ttf'),
};

// 레벨 구간 수 — 지금 캐릭터 이미지가 1~5레벨 5종뿐이고 LEVEL_EXP_MAX도 5개 항목이라 여기서
// 그대로 끌어온다(별도로 하드코딩하면 나중에 레벨이 추가될 때 둘이 어긋날 수 있다).
const LEVEL_COUNT = Object.keys(LEVEL_EXP_MAX).length;

// MY-01(GET /api/v1/users/me) — 레벨/exp/검증 횟수 등 프로필 숫자를 담당한다. 이 API엔
// 빈 상태(NO_XXX)가 없어(신규 사용자도 항상 level:1 등 정상값) loading/error/available 세
// 상태만 관리하면 된다.
type ProfileState = { status: 'loading' } | { status: 'error' } | { status: 'available'; profile: UserMeData };

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// MY-02(GET /api/v1/users/me/data-status) — baseDate가 없는 API다(날짜별로 달라지는 값이 응답에
// 없음). NO_SLEEP_DATA도 에러가 아닌 정상 빈 상태라 loading/error/no_data/available 네 상태로 관리한다.
type DataStatusState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'no_data'; message: string | null }
  | { status: 'available'; lastReceivedAt: string };

// "오늘의 투두 n/5" — GET /api/v1/todo(TODO 탭과 같은 API)를 여기서도 독립적으로 호출해 채운다.
// todo.tsx는 실 API의 숫자 id를 자체 로컬 state로만 관리하므로(주석 참고, 문자열 슬러그 기반
// 구 mock store와 id 체계가 달라 공유 store를 쓰지 않기로 함) 이 화면은 todo 탭 방문 여부와
// 무관하게 스스로 오늘 치 checklistItems를 불러와 DONE 개수를 센다. AVAILABLE/NO_SLEEP_DATA
// 둘 다 checklistItems 배열을 갖고 있어(비어있을 수 있음) 두 상태를 구분할 필요 없이 하나로
// 묶는다 — 여기서 필요한 건 오직 진행률 숫자뿐, empty-state 문구는 todo 탭의 몫이다.
type TodoProgressState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'available'; completed: number; total: number };

// lastReceivedAt은 "마지막으로 잔 날"이 아니라 "서버가 데이터를 받은 시각"이므로 그 의미가
// 드러나도록 날짜+시:분까지 KST로 포맷한다. 파싱 실패는 원본 문자열을 그대로 보여줘 방어한다.
function formatSyncTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hours = String(kst.getUTCHours()).padStart(2, '0');
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

// 다음 동기화 시점/HealthKit 권한 상태는 서버가 알 방법이 없다(둘 다 클라이언트 로컬 사정) —
// 이 앱의 실제 업로드 정책("앱을 켤 때마다 업로드")을 고정 문구로 그대로 노출한다(MY-02 규칙 2).
const SYNC_POLICY_TEXT = '앱을 켤 때마다 자동으로 최신 수면 데이터를 가져와요';

// 이번 주 출석 스트릭 띠(node 541:2985) — POST /api/v1/users/me/attendance(HOME-04) 응답의
// weekDays(월~일 7칸, 날짜별 ATTENDED/MISSED/UPCOMING 실측)를 그대로 그린다.
//
// 예전엔 MY-01(GET /api/v1/users/me)의 streakCount(연속 "검증" 횟수 — 출석과 다른 개념)를
// week-streak.ts(isWeekdayInTrailingStreak)로 이번 주에 투영해 흉내 냈었다. 그 근사는 신규
// 유저가 월요일에 첫 출석을 해도 streakCount가 0이라 체크 대신 실패 표시가 뜨는 버그가 있었다
// (attendance-flow.tsx에 있던 것과 동일한 원인 — 자세한 경위는 그 파일 상단 주석 참고). 지금은
// 이 화면이 직접 attendance API를 호출해 정확한 weekDays로 그린다 — 이 호출은 앱 시작마다
// _layout.tsx가 이미 한 번 부른 뒤라 항상 "재호출"(200, checkedIn:false)이라 중복 지급 걱정은
// 없다(재호출은 에러가 아니고, 같은 날 몇 번을 불러도 하루 1회 지급은 서버가 보장한다).
//
// 완료(파랑) / 결석 — MISSED, 그리고 오늘인데 아직 기록이 없는 극히 드문 경우도 같은 취급(빨강,
// 오늘 칸에는 위쪽 세모 표시가 추가로 붙는다) / 예정 — UPCOMING(회색) 세 가지 시각 상태로 그린다.
// attendance-flow.tsx(출석 팝업)의 체크·X·빈칸 3구분과 같은 원칙 — "결석"과 "예정"을 같은 색으로
// 뭉개면 아직 오지도 않은 날이 빠뜨린 날처럼 보인다.
type WeekStreakState = 'done' | 'missed' | 'upcoming';

const WEEK_STREAK_COLORS: Record<WeekStreakState, { ring: string; circleBg: string }> = {
  done: { ring: '#058BFC', circleBg: '#8ECDFF' },
  missed: { ring: '#F91D33', circleBg: '#FFFFFF' },
  upcoming: { ring: '#949597', circleBg: '#FFFFFF' },
};

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

/**
 * weekDays(서버가 항상 월~일 7칸으로 보장)를 그대로 이번 주 7칸에 대응시킨다. isToday는 요일
 * 인덱스가 아니라 날짜 문자열로 판정한다(주 경계 계산을 다시 하지 않기 위해 서버 값을 그대로
 * 믿는다). UPCOMING만 upcoming(회색)이고, ATTENDED가 아닌 나머지(MISSED·오늘인데 아직 기록이
 * 없는 드문 경우)는 전부 missed(빨강)로 그린다 — day가 없으면(로딩 중 등 방어) 안전하게 upcoming.
 */
function buildWeekStreakDays(
  weekDays: AttendanceWeekDay[],
  todayDateString: string
): { label: string; state: WeekStreakState; isToday: boolean }[] {
  return WEEKDAY_LABELS.map((label, index) => {
    const day = weekDays[index];
    const isToday = day?.date === todayDateString;
    if (!day || day.status === 'UPCOMING') return { label, state: 'upcoming' as const, isToday };
    if (day.status === 'ATTENDED') return { label, state: 'done' as const, isToday };
    return { label, state: 'missed' as const, isToday };
  });
}

// EXP 구간 막대(node 541:3021~3034) — Figma 원본은 일자형이 아니라, 한 줄짜리 막대가 오른쪽
// 아래로 한 번, 왼쪽 아래로 한 번 꺾이는 3단(위/가운데/아래) 뱀 모양 트랙이다(고해상도로 다시
// 렌더해서 확인). react-native-svg 등 경로(path) 렌더링 라이브러리가 없어, 뱀 모양을 직선
// 구간(row) 3개 + 모서리를 잇는 세로 연결 구간(connector) 2개, 총 5개의 조각으로 나눠 View로
// 쌓는다. 전체 트랙 길이(EXP_BAR_TOTAL_LENGTH)를 LEVEL_COUNT칸으로 균등하게 나눠 현재 레벨만큼
// 앞에서부터 채우고("4레벨이면 4칸이 차있게"), 칸 경계마다 "^" 표시를 그 경계까지 채워졌으면
// 파란색(도달), 아니면 회색(미도달)으로 찍는다.
const EXP_BAR_ROW_WIDTH = 330;
const EXP_BAR_THICKNESS = 10;
const EXP_BAR_ROW1_TOP = 0;
const EXP_BAR_ROWMID_TOP = 47;
const EXP_BAR_ROW3_TOP = 92;
const EXP_BAR_RIGHT_CONNECTOR_HEIGHT = 57; // row1 오른쪽 끝 → 가운데 줄 오른쪽 끝
const EXP_BAR_LEFT_CONNECTOR_HEIGHT = 55; // 가운데 줄 왼쪽 끝 → row3 왼쪽 끝
const EXP_BAR_TOTAL_LENGTH =
  EXP_BAR_ROW_WIDTH + EXP_BAR_RIGHT_CONNECTOR_HEIGHT + EXP_BAR_ROW_WIDTH + EXP_BAR_LEFT_CONNECTOR_HEIGHT + EXP_BAR_ROW_WIDTH;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// 트랙을 따라 distance(0~EXP_BAR_TOTAL_LENGTH)만큼 이동한 지점의 화면 좌표 — "^" 경계 표시
// 위치를 계산하는 데 쓴다. row1(왼→오) → 오른쪽 연결(위→아래) → 가운데 줄(오→왼, 역방향) →
// 왼쪽 연결(위→아래) → row3(왼→오) 순서로 흐른다.
function pointAtDistance(distance: number): { x: number; y: number } {
  let remaining = distance;
  if (remaining <= EXP_BAR_ROW_WIDTH) {
    return { x: remaining, y: EXP_BAR_ROW1_TOP + EXP_BAR_THICKNESS + 2 };
  }
  remaining -= EXP_BAR_ROW_WIDTH;
  if (remaining <= EXP_BAR_RIGHT_CONNECTOR_HEIGHT) {
    return { x: EXP_BAR_ROW_WIDTH, y: EXP_BAR_ROW1_TOP + remaining };
  }
  remaining -= EXP_BAR_RIGHT_CONNECTOR_HEIGHT;
  if (remaining <= EXP_BAR_ROW_WIDTH) {
    return { x: EXP_BAR_ROW_WIDTH - remaining, y: EXP_BAR_ROWMID_TOP + EXP_BAR_THICKNESS + 2 };
  }
  remaining -= EXP_BAR_ROW_WIDTH;
  if (remaining <= EXP_BAR_LEFT_CONNECTOR_HEIGHT) {
    return { x: 0, y: EXP_BAR_ROWMID_TOP + remaining };
  }
  remaining -= EXP_BAR_LEFT_CONNECTOR_HEIGHT;
  return { x: remaining, y: EXP_BAR_ROW3_TOP + EXP_BAR_THICKNESS + 2 };
}

/**
 * level(정수)만으로 통째로 한 칸씩 채우던 것을, 그 레벨 구간 안에서 실제 exp 비율(progressPercent,
 * 0~100 — 홈 화면과 같은 getLevelExpDisplay 소스)만큼 미세하게 차오르도록 계산한다.
 * ((레벨 - 1) + progressPercent/100) / LEVEL_COUNT — 레벨 N 안에서 exp가 0%면 (N-1)칸까지만,
 * 100%(=다음 레벨 직전)면 N칸까지 찬 것처럼 보이다가 실제로 레벨업하는 순간 다음 칸으로 넘어간다.
 * 단, "^" 경계 표시(reached)는 exp 비율과 무관하게 실제로 그 레벨을 넘었는지만 봐야 하므로
 * 정수 level을 그대로 쓴다(아래 dividers.map 참고) — progressPercent로 계산하면 안 됨.
 */
function LevelSegmentBar({ level, progressPercent }: { level: number; progressPercent: number }) {
  const levelProgress = level - 1 + progressPercent / 100;
  const filledLength = clamp((levelProgress / LEVEL_COUNT) * EXP_BAR_TOTAL_LENGTH, 0, EXP_BAR_TOTAL_LENGTH);

  const row1Filled = clamp(filledLength, 0, EXP_BAR_ROW_WIDTH);
  const rightConnStart = EXP_BAR_ROW_WIDTH;
  const rightConnFilled = clamp(filledLength - rightConnStart, 0, EXP_BAR_RIGHT_CONNECTOR_HEIGHT);
  const rowMidStart = rightConnStart + EXP_BAR_RIGHT_CONNECTOR_HEIGHT;
  const rowMidFilled = clamp(filledLength - rowMidStart, 0, EXP_BAR_ROW_WIDTH);
  const leftConnStart = rowMidStart + EXP_BAR_ROW_WIDTH;
  const leftConnFilled = clamp(filledLength - leftConnStart, 0, EXP_BAR_LEFT_CONNECTOR_HEIGHT);
  const row3Start = leftConnStart + EXP_BAR_LEFT_CONNECTOR_HEIGHT;
  const row3Filled = clamp(filledLength - row3Start, 0, EXP_BAR_ROW_WIDTH);

  const dividers = Array.from({ length: LEVEL_COUNT - 1 }, (_, index) => index + 1);

  return (
    <View style={styles.expBarWrapper}>
      {/* 회색 트랙(배경) 5조각 — 파란 채움보다 먼저 그려서 채움이 항상 위로 겹치게 한다. */}
      <View style={[styles.expBarRowTrack, { top: EXP_BAR_ROW1_TOP, left: 0, width: EXP_BAR_ROW_WIDTH }]} />
      <View
        style={[
          styles.expBarConnectorTrack,
          { top: EXP_BAR_ROW1_TOP, left: EXP_BAR_ROW_WIDTH - EXP_BAR_THICKNESS, height: EXP_BAR_RIGHT_CONNECTOR_HEIGHT },
        ]}
      />
      <View style={[styles.expBarRowTrack, { top: EXP_BAR_ROWMID_TOP, left: 0, width: EXP_BAR_ROW_WIDTH }]} />
      <View style={[styles.expBarConnectorTrack, { top: EXP_BAR_ROWMID_TOP, left: 0, height: EXP_BAR_LEFT_CONNECTOR_HEIGHT }]} />
      <View style={[styles.expBarRowTrack, { top: EXP_BAR_ROW3_TOP, left: 0, width: EXP_BAR_ROW_WIDTH }]} />

      {/* 파란 채움 5조각 — row1/row3는 왼쪽부터, 가운데 줄은 흐름 방향이 반대라 오른쪽부터 찬다. */}
      <View style={[styles.expBarRowFill, { top: EXP_BAR_ROW1_TOP, left: 0, width: row1Filled }]} />
      <View
        style={[
          styles.expBarConnectorFill,
          { top: EXP_BAR_ROW1_TOP, left: EXP_BAR_ROW_WIDTH - EXP_BAR_THICKNESS, height: rightConnFilled },
        ]}
      />
      <View style={[styles.expBarRowFill, { top: EXP_BAR_ROWMID_TOP, left: EXP_BAR_ROW_WIDTH - rowMidFilled, width: rowMidFilled }]} />
      <View style={[styles.expBarConnectorFill, { top: EXP_BAR_ROWMID_TOP, left: 0, height: leftConnFilled }]} />
      <View style={[styles.expBarRowFill, { top: EXP_BAR_ROW3_TOP, left: 0, width: row3Filled }]} />

      {dividers.map((divider) => {
        const point = pointAtDistance((divider / LEVEL_COUNT) * EXP_BAR_TOTAL_LENGTH);
        const reached = divider <= level - 1;
        return (
          <Text
            key={divider}
            style={[styles.expBarDivider, { left: point.x, top: point.y }, reached ? styles.expBarDividerReached : styles.expBarDividerUpcoming]}>
            ^
          </Text>
        );
      })}
    </View>
  );
}

// MY-04(회원 탈퇴) 2단계 확인 다이얼로그 — 서버는 요청을 받으면 확인 없이 즉시 영구 삭제하므로
// (soft delete 아님, 되돌릴 방법 없음) 이 확인은 100% 클라이언트 책임이다. RN Alert.alert는 이
// 프로젝트가 신경 쓰는 웹 테스트 환경(react-native-web)에서 버튼별 onPress가 신뢰성 있게 동작하지
// 않아, 다른 팝업들(AvoidDetailModal 등)과 동일하게 커스텀 Modal로 구현한다.
function DeleteAccountConfirmModal({
  visible,
  deleting,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  deleting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.deleteModalBackdrop} onPress={deleting ? undefined : onCancel}>
        <Pressable style={styles.deleteModalCard} onPress={() => {}}>
          <Text style={styles.deleteModalTitle}>정말 삭제하시겠어요?</Text>
          <Text style={styles.deleteModalBody}>
            모든 수면 데이터와 적립 내역이{'\n'}영구적으로 삭제되며 복구할 수 없어요.
          </Text>
          {errorMessage && <Text style={styles.deleteModalError}>{errorMessage}</Text>}
          <View style={styles.deleteModalActions}>
            <Pressable
              onPress={onCancel}
              disabled={deleting}
              style={({ pressed }) => [styles.deleteModalCancelButton, pressed && styles.pressed]}>
              <Text style={styles.deleteModalCancelText}>취소</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={deleting}
              style={({ pressed }) => [
                styles.deleteModalConfirmButton,
                pressed && styles.pressed,
                deleting && styles.deleteModalConfirmButtonDisabled,
              ]}>
              <Text style={styles.deleteModalConfirmText}>{deleting ? '삭제 중...' : '영구 삭제'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function MyScreen() {
  const router = useRouter();
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [fontsLoaded] = useFonts(MY_SCREEN_FONTS);
  // "오늘의 투두 n/5" — 위 TodoProgressState 주석 참고. todo 탭과 별개로 이 화면이 직접 조회한다.
  const [todoProgressState, setTodoProgressState] = useState<TodoProgressState>({ status: 'loading' });

  // TODO 탭에서 체크리스트를 토글하면 이 화면도 다시 조회해야 한다 — 탭 네비게이터가 화면을
  // 언마운트하지 않아서 마운트 시 한 번만 조회하면 탭을 옮겨도 옛 값에 머문다
  // (use-todo-changed-signal.ts). 아래 profileState effect도 같은 이유로 이 신호를 쓴다.
  const todoChangedSignal = useTodoChangedSignal();

  useEffect(() => {
    getDailyTodos(getTodayDateString(), TEMP_USER_ID)
      .then(({ data }) => {
        const total = data.checklistItems.length;
        const completed = data.checklistItems.filter((item) => item.status === 'DONE').length;
        setTodoProgressState({ status: 'available', completed, total });
      })
      .catch((error) => {
        console.error('❌ 오늘의 투두 조회 실패:', error);
        setTodoProgressState({ status: 'error' });
      });
  }, [todoChangedSignal]);

  const completedCount = todoProgressState.status === 'available' ? todoProgressState.completed : 0;
  const totalCount = todoProgressState.status === 'available' ? todoProgressState.total : 0;
  const todoProgress = totalCount === 0 ? 0 : completedCount / totalCount;

  // MY-01 — 레벨/exp/검증 횟수 프로필. baseDate는 streakCount(연속 검증 횟수) 계산에 필요하다
  // (서버가 타임존을 모르므로 앱의 로컬 "오늘"을 보내야 함, GET /skin/verification/summary와 동일 규칙).
  const [profileState, setProfileState] = useState<ProfileState>({ status: 'loading' });

  useEffect(() => {
    getUserMe(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => setProfileState({ status: 'available', profile: data }))
      .catch((error) => {
        console.error('❌ 프로필 조회 실패:', error);
        setProfileState({ status: 'error' });
      });
  }, [todoChangedSignal]);

  // 로딩/에러 중엔 레벨 관련 UI가 깨지지 않도록 안전한 기본값(1레벨, 만렙 아님)을 쓴다 — 실제
  // 값이 오면 즉시 이 값들로 교체된다.
  const profile = profileState.status === 'available' ? profileState.profile : null;
  const level = profile?.level ?? 1;
  const remainingExp = profile ? calculateRemainingExp(profile) : null;
  // 홈 화면(index.tsx)의 exp 게이지와 같은 소스 — 레벨 바가 그 레벨 안에서 실제 exp 비율만큼
  // 미세하게 차오르게 하는 데 쓴다(아래 LevelSegmentBar).
  const expDisplay = getLevelExpDisplay(profile);
  const characterImage = LEVEL_CHARACTER_IMAGES[level] ?? LEVEL_CHARACTER_IMAGES[1];

  // "이번 주 출석 스트릭" 띠 전용 — HOME-04(POST /api/v1/users/me/attendance)를 재호출해 정확한
  // weekDays를 얻는다(위 buildWeekStreakDays 주석 참고). _layout.tsx가 앱 시작 시 이미 한 번
  // 불렀으므로 이 호출은 항상 그날의 재호출이라 중복 지급되지 않는다.
  const [weekDaysState, setWeekDaysState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'available'; weekDays: AttendanceWeekDay[] }
  >({ status: 'loading' });

  useEffect(() => {
    checkInAttendance(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => setWeekDaysState({ status: 'available', weekDays: data.weekDays }))
      .catch((error) => {
        console.error('❌ 출석 스트릭 조회 실패:', error);
        setWeekDaysState({ status: 'error' });
      });
  }, []);

  // 로딩/에러 중엔 빈 배열로 취급 — buildWeekStreakDays가 (day를 못 찾으니) 전부 upcoming으로
  // 안전하게 그린다.
  const weekStreakDays = buildWeekStreakDays(
    weekDaysState.status === 'available' ? weekDaysState.weekDays : [],
    getTodayDateString()
  );

  // MY-02 — 수면 데이터 연결 상태. baseDate를 보내지 않는다(위 DataStatusState 주석 참고).
  const [dataStatusState, setDataStatusState] = useState<DataStatusState>({ status: 'loading' });

  useEffect(() => {
    getDataStatus(TEMP_USER_ID)
      .then(({ data }) => {
        setDataStatusState(
          data.status === 'AVAILABLE'
            ? { status: 'available', lastReceivedAt: data.lastReceivedAt }
            : { status: 'no_data', message: data.message }
        );
      })
      .catch((error) => {
        console.error('❌ 수면 데이터 연결 상태 조회 실패:', error);
        setDataStatusState({ status: 'error' });
      });
  }, []);

  // MY-04 — 2단계 확인(먼저 버튼 탭, 그다음 모달에서 확정) 없이는 절대 API를 쏘지 않는다.
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserMe(TEMP_USER_ID);
      // hard delete 성공 — _layout.tsx에 "온보딩/동의 화면으로 강제로 돌아가라"는 신호를 보낸다.
      // entryRoute가 바뀌면 (tabs) 트리 전체(이 화면 포함)가 곧바로 언마운트되므로 여기서 모달을
      // 직접 닫을 필요는 없다.
      signalAccountDeleted();
    } catch (error) {
      console.error('❌ 회원 탈퇴 실패:', error);
      setDeleting(false);
      setDeleteError('삭제에 실패했어요. 잠시 후 다시 시도해주세요.');
    }
  };

  // 폰트 로드 전엔 흰 배경만 렌더한다 — 시스템 폰트로 잠깐 렌더돼 줄바꿈이 튀는 걸 막는다.
  if (!fontsLoaded) {
    return <SafeAreaView style={styles.screen} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* useDesignScale이 화면 높이에 맞춰 캔버스를 축소해 보여주므로 스크롤이 필요 없다
          (index.tsx와 동일한 패턴) — 스크롤바 없이 항상 고정된 한 화면으로 보인다. */}
      <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
          {/* 톱니바퀴(설정) 아이콘 (node 541:3039, x:344 y:34 w:24 h:23) — /my-model 페이지로 이동한다. */}
          <Pressable onPress={() => router.push('/my-model')} hitSlop={12} style={styles.settingsButton}>
            <Image source={require('@/assets/images/figma-icon-my-settings.svg')} style={styles.settingsIcon} contentFit="contain" />
          </Pressable>

          {/* "LEVEL. 4" (node 541:3037) — MY-01(GET /api/v1/users/me) 실값. 로딩/에러 중엔 안전한
              기본값(1레벨)을 잠깐 보여준다(위 level 변수 참고). */}
          <ThemedText style={styles.levelTitle}>LEVEL. {level}</ThemedText>
          {/* "내 루틴을 찾았어요!" (node 541:3038) */}
          <ThemedText style={styles.levelSubtitle}>내 루틴을 찾았어요!</ThemedText>
          {/* MY-01 검증 신뢰도 — Figma 노드 없음. verificationCount로 계산한 신뢰도 문구
              (calculateVerificationTrustLevel, api/user.ts)와 streakCount(연속 검증 횟수)를
              보여준다. 아래 "이번 주 출석 스트릭" 띠는 다른 API(HOME-04)의 실제 출석 기록을
              그리는 것이라 이 줄의 streakCount(검증 스트릭)와는 서로 다른 값이다 — 혼동하지 말 것. */}
          {profileState.status === 'available' && (
            <ThemedText style={styles.trustLevelText}>
              검증 {profileState.profile.verificationCount}회 · 연속 {profileState.profile.streakCount}일 ·{' '}
              {calculateVerificationTrustLevel(profileState.profile.verificationCount)}
            </ThemedText>
          )}

          {/* 캐릭터 (node 551:1316) — 홈 화면(index.tsx)과 동일한 LEVEL_CHARACTER_IMAGES 맵을 써서
              레벨(level)에 맞는 이미지를 고른다 — 항상 "홈 화면에 있는 현재 캐릭터"와 같은
              그림이 보이도록 한다. 그림자(node 541:2984)는 제거했고, 위치는 아래 characterImage
              주석 참고. */}
          <Image source={characterImage} style={styles.characterImage} contentFit="contain" />

          {/* 날짜 내비게이션 (node 541:3016/3017/3019) — 실제 날짜별 데이터가 없어 화살표는
              장식용이고 탭해도 아무 동작이 없다(다른 화면들의 정적 목업과 동일한 취급). */}
          <Image
            source={require('@/assets/images/figma-icon-my-date-chevron-left.svg')}
            style={[styles.dateChevron, styles.dateChevronLeft]}
            contentFit="contain"
          />
          <ThemedText style={styles.dateText}>2026년 8월 15일 토요일</ThemedText>
          <Image
            source={require('@/assets/images/figma-icon-my-date-chevron-right.svg')}
            style={[styles.dateChevron, styles.dateChevronRight]}
            contentFit="contain"
          />

          {/* 이번 주 출석 스트릭 (node 541:2985, HOME-04 weekDays 실연동 — 위 buildWeekStreakDays 주석 참고) */}
          <View style={styles.weekStreakRow}>
            {weekStreakDays.map((day, index) => {
              const colors = WEEK_STREAK_COLORS[day.state];
              return (
                <View key={index} style={styles.weekStreakDay}>
                  <View style={styles.weekStreakMarkerSlot}>
                    {day.isToday && <Text style={styles.weekStreakMarker}>▼</Text>}
                  </View>
                  <View style={[styles.weekStreakCircle, { backgroundColor: colors.circleBg, borderColor: colors.ring }]}>
                    <Image
                      source={require('@/assets/images/figma-icon-my-streak-face.png')}
                      style={styles.weekStreakFace}
                      contentFit="contain"
                    />
                  </View>
                  <Text style={[styles.weekStreakLabel, { color: colors.ring }]}>{day.label}</Text>
                </View>
              );
            })}
          </View>

          {/* "+ EXP" 섹션 제목 (node 541:3021) */}
          <Text style={styles.expSectionTitle}>+ EXP</Text>
          {/* EXP 구간 막대 (node 541:3024~3034) — 위 LevelSegmentBar 주석 참고, 실 레벨(level) 사용 */}
          <LevelSegmentBar level={level} progressPercent={expDisplay.percent} />
          {/* 다음 레벨까지 남은 exp — Figma 노드 없음. nextLevelExp가 null(만렙)이면 "MAX 레벨"로
              방어한다(출석체크 팝업(attendance-flow.tsx)의 동일 규칙과 같은 calculateRemainingExp
              사용, api/game.ts). 로딩 중엔 아무것도 보여주지 않는다(어중간한 값을 보여주지 않기 위함). */}
          {profileState.status === 'available' && (
            <ThemedText style={styles.expRemainingText}>
              {remainingExp === null ? 'MAX 레벨' : `다음 레벨까지 ${remainingExp} EXP`}
            </ThemedText>
          )}

          {/* "오늘의 투두 n/5" (node 541:3022) — TODO 탭과 실시간으로 동기화된다(위 주석 참고). */}
          <ThemedText style={styles.todoSummaryText}>
            오늘의 투두{'    '}
            {completedCount} / {totalCount}
          </ThemedText>
          {/* "투두완료" 배지 (node 541:3027/3028) — 오늘의 투두를 전부 끝냈을 때만 보이고,
              탭하면 TODO 탭으로 이동한다. */}
          {totalCount > 0 && completedCount === totalCount && (
            <Pressable onPress={() => router.push('/todo')} style={({ pressed }) => [styles.todoBadge, pressed && styles.pressed]}>
              <Text style={styles.todoBadgeText}>투두완료</Text>
            </Pressable>
          )}
          {/* 오늘의 투두 진행 바 (node 541:3023/3025) — completedCount/totalCount로 실시간 계산. */}
          <View style={styles.todoProgressTrack}>
            <View style={[styles.todoProgressFill, { width: `${todoProgress * 100}%` }]} />
          </View>

          {/* MY-02 수면 데이터 연결 상태 — Figma 노드 없음. NO_SLEEP_DATA(신규 유저 등, 에러 아님)와
              AVAILABLE을 서로 다른 문구로 분기한다. 두 상태 모두 아래 고정 정책 문구는 동일하게 보여준다
              (다음 동기화 시점/HealthKit 권한은 서버가 몰라 프론트가 정책을 그대로 노출, MY-02 규칙 2). */}
          {dataStatusState.status === 'available' && (
            <ThemedText style={styles.syncStatusText}>
              마지막 동기화: {formatSyncTimestamp(dataStatusState.lastReceivedAt)}
            </ThemedText>
          )}
          {dataStatusState.status === 'no_data' && (
            <ThemedText style={styles.syncStatusText}>
              {dataStatusState.message ?? '아직 수면 데이터 동기화 이력이 없어요'}
            </ThemedText>
          )}
          {dataStatusState.status === 'error' && (
            <ThemedText style={styles.syncStatusText}>연결 상태를 불러오지 못했어요</ThemedText>
          )}
          {dataStatusState.status !== 'loading' && (
            <ThemedText style={styles.syncPolicyText}>{SYNC_POLICY_TEXT}</ThemedText>
          )}

          {/* MY-04 회원 탈퇴 — Figma 노드 없음. 누르면 API를 바로 쏘지 않고 확인 모달부터 띄운다
              (DeleteAccountConfirmModal 주석 참고). */}
          <Pressable
            onPress={() => {
              setDeleteError(null);
              setDeleteModalVisible(true);
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.deleteAccountButton, pressed && styles.pressed]}>
            <Text style={styles.deleteAccountButtonText}>모든 기록 삭제(회원 탈퇴)</Text>
          </Pressable>
        </View>
      </View>

      <DeleteAccountConfirmModal
        visible={deleteModalVisible}
        deleting={deleting}
        errorMessage={deleteError}
        onCancel={() => setDeleteModalVisible(false)}
        onConfirm={handleConfirmDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: Colors.bgSoftBlue,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
  // 톱니바퀴 아이콘 (node 541:3039, x:344 y:34 w:24 h:23)
  settingsButton: {
    position: 'absolute',
    left: 344,
    top: 34,
  },
  settingsIcon: {
    width: 24,
    height: 23,
  },
  // "LEVEL. 4" (node 541:3037, x:143 y:39 w:137.72, 중앙 정렬) — 전체 폭 기준으로 중앙 정렬한다.
  levelTitle: {
    position: 'absolute',
    left: 0,
    top: 39,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  // "내 루틴을 찾았어요!" (node 541:3038, x:123 y:83 w:178, Pretendard SemiBold 21.7px)
  levelSubtitle: {
    position: 'absolute',
    left: 0,
    top: 83,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 26,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: Colors.primaryDark,
  },
  // MY-01 검증 신뢰도 문구 — Figma 노드 없음, levelSubtitle(top:83, 높이~26) 바로 아래 여백에 얹는다.
  trustLevelText: {
    position: 'absolute',
    left: 0,
    top: 109,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: 'rgba(3, 25, 73, 0.55)',
  },
  // 캐릭터 (node 551:1316) — 그림자(node 541:2984)를 지운 뒤, "검증 N회 · 연속 N일" 텍스트
  // 블록(trustLevelText, top:109 + lineHeight:14 = bottom 123)과 날짜 표시 행(dateChevron,
  // top:395) 사이 빈 공간의 정중앙(123과 395의 중점 = 259)에 오도록 top을 다시 잡았다
  // (top = 259 - height/2). 레벨별 이미지의 가로세로 비율이 서로 달라(1·2는 눕고 넓은 포즈,
  // 3은 서 있는 세로 포즈 등) contentFit="contain"이 안쪽에서 알아서 맞추므로, 박스 자체는
  // width만 넉넉히(캔버스 402 기준 좌우 22px 여백, weekStreakRow와 동일한 여백 관례) 잡고
  // height는 위아래 여백(11px)을 남기고 저 gap을 넘치지 않게 잡았다.
  characterImage: {
    position: 'absolute',
    left: 22,
    top: 134,
    width: 358,
    height: 250,
  },
  // 날짜 화살표 (node 541:3017/3019, w:33 h:33)
  dateChevron: {
    position: 'absolute',
    top: 395,
    width: 33,
    height: 33,
  },
  dateChevronLeft: {
    left: 57,
  },
  dateChevronRight: {
    left: 331,
  },
  // "2026년 8월 15일 토요일" (node 541:3016, x:98.69 y:396.74 w:228) — Figma는 22.6px를 쓰지만
  // 그대로 옮기면 폭 228px에 두 줄로 넘어간다. 화살표 사이 여백(x:90~331, 약 240px)에 한 줄로
  // 들어가도록 줄였다.
  dateText: {
    position: 'absolute',
    left: 81,
    top: 398,
    width: 240,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 21,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#000000',
  },
  // 이번 주 출석 스트릭 (node 541:2985, x:28 y:434 w:358.06) — 요일 7개를 flex row로 균등 배치한다
  // (Figma 원본은 요일마다 좌표가 조금씩 불균일하지만 눈에 띄지 않는 차이라 통일했다).
  weekStreakRow: {
    position: 'absolute',
    left: 28,
    top: 434,
    width: 358,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekStreakDay: {
    width: 46,
    alignItems: 'center',
  },
  // "오늘" 위 빨간 세모(node 541:3015) 자리 — 다른 요일도 높이를 맞추려고 항상 자리를 차지한다.
  weekStreakMarkerSlot: {
    height: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  weekStreakMarker: {
    fontSize: 12,
    lineHeight: 12,
    color: '#F91D33',
  },
  // 요일 원 (node 541:2989 등, w:45.21 h:45.21, radius: 원형)
  weekStreakCircle: {
    width: 45,
    height: 45,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  weekStreakFace: {
    width: 31,
    height: 26,
  },
  // 요일 라벨 ("완료"/"N일", node 541:2998 등, Pretendard SemiBold ~12px)
  weekStreakLabel: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: PRETENDARD_SEMIBOLD,
  },
  // "+ EXP" (node 541:3021, x:34 y:531 w:85, Press Start 2P 17px)
  expSectionTitle: {
    position: 'absolute',
    left: 34,
    top: 531,
    fontSize: 17,
    fontFamily: PRESS_START_2P,
    color: '#000000',
  },
  // EXP 뱀 모양 막대 자리 (node 541:3024~3032 전체를 감싸는 영역, x:36 y:574 w:330 h:102) —
  // 안의 5개 조각(row1/rightConnector/rowMid/leftConnector/row3)은 전부 이 안에서 로컬 좌표로
  // 절대 배치된다(LevelSegmentBar 위 주석 참고).
  expBarWrapper: {
    position: 'absolute',
    left: 36,
    top: 574,
    width: EXP_BAR_ROW_WIDTH,
    height: EXP_BAR_ROW3_TOP + EXP_BAR_THICKNESS,
  },
  // 직선 구간(row) 회색 트랙 — top/left/width는 인라인으로 조각마다 지정
  expBarRowTrack: {
    position: 'absolute',
    height: EXP_BAR_THICKNESS,
    borderRadius: EXP_BAR_THICKNESS / 2,
    backgroundColor: '#CBD4DD',
  },
  // 직선 구간(row) 파란 채움
  expBarRowFill: {
    position: 'absolute',
    height: EXP_BAR_THICKNESS,
    borderRadius: EXP_BAR_THICKNESS / 2,
    backgroundColor: '#058BFC',
  },
  // 모서리를 잇는 세로 연결 구간 회색 트랙 — top/left/height는 인라인
  expBarConnectorTrack: {
    position: 'absolute',
    width: EXP_BAR_THICKNESS,
    borderRadius: EXP_BAR_THICKNESS / 2,
    backgroundColor: '#CBD4DD',
  },
  // 세로 연결 구간 파란 채움
  expBarConnectorFill: {
    position: 'absolute',
    width: EXP_BAR_THICKNESS,
    borderRadius: EXP_BAR_THICKNESS / 2,
    backgroundColor: '#058BFC',
  },
  // 레벨 경계 "^" 표시 (node 541:3033/3034) — left/top은 인라인 px, 가운데 정렬을 위해
  // marginLeft로 글자 폭 절반만큼 왼쪽으로 당긴다.
  expBarDivider: {
    position: 'absolute',
    marginLeft: -5,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  expBarDividerReached: {
    color: '#058BFC',
  },
  expBarDividerUpcoming: {
    color: '#CBD4DD',
  },
  // "오늘의 투두    n / 5" (node 541:3022, x:33 y:695 w:142, Pretendard SemiBold 19px)
  // 다음 레벨까지 남은 exp — Figma 노드 없음, expBarWrapper(top:574 h:102, 끝 676)와
  // todoSummaryText(top:695) 사이 여백에 얹는다.
  expRemainingText: {
    position: 'absolute',
    left: 36,
    top: 679,
    width: EXP_BAR_ROW_WIDTH,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    color: 'rgba(3, 25, 73, 0.55)',
  },
  todoSummaryText: {
    position: 'absolute',
    left: 33,
    top: 695,
    fontSize: 19,
    lineHeight: 23,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#000000',
  },
  // "투두완료" 배지 (node 541:3027/3028, x:307 y:700 w:58.15 h:18, radius:4.85)
  todoBadge: {
    position: 'absolute',
    left: 307,
    top: 700,
    width: 58,
    height: 18,
    borderRadius: 5,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoBadgeText: {
    fontSize: 10,
    fontFamily: PRETENDARD_LIGHT,
    color: '#FFFFFF',
  },
  // 오늘의 투두 진행 바 (node 541:3023/3025, x:33 y:739 w:332)
  todoProgressTrack: {
    position: 'absolute',
    left: 33,
    top: 739,
    width: 332,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(203, 212, 221, 0.58)',
    overflow: 'hidden',
  },
  todoProgressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#058BFC',
  },

  // MY-02 수면 데이터 연결 상태 — Figma 노드 없음, todoProgressTrack(top:739 h:10, 끝 749) 아래 여백에 얹는다.
  syncStatusText: {
    position: 'absolute',
    left: 0,
    top: 754,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  syncPolicyText: {
    position: 'absolute',
    left: 0,
    top: 771,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '500',
    color: '#9E9E9E',
  },

  // MY-04 회원 탈퇴 버튼 — Figma 노드 없음, 화면 맨 아래 여백에 얹는다.
  deleteAccountButton: {
    position: 'absolute',
    left: 0,
    top: 810,
    width: CANVAS_WIDTH,
    alignItems: 'center',
  },
  deleteAccountButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(229, 34, 34, 0.7)',
    textDecorationLine: 'underline',
  },

  // ── DeleteAccountConfirmModal ────────────────────────────────────────────
  deleteModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingHorizontal: 32,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 22,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  deleteModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  deleteModalBody: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: 'rgba(55, 56, 60, 0.75)',
    textAlign: 'center',
  },
  deleteModalError: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E52222',
    textAlign: 'center',
  },
  deleteModalActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  deleteModalCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(112, 115, 124, 0.12)',
  },
  deleteModalCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  deleteModalConfirmButton: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E52222',
  },
  deleteModalConfirmButtonDisabled: {
    opacity: 0.6,
  },
  deleteModalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
