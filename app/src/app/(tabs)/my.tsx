import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateRemainingExp, checkInAttendance, getLevelExpDisplay, type AttendanceWeekDay } from '@/api/game';
import { getDailyTodos } from '@/api/todo';
import { calculateVerificationTrustLevel, getDataStatus, getUserMe, type UserMeData } from '@/api/user';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { LEVEL_CHARACTER_IMAGES, LEVEL_EXP_MAX } from '@/constants/mockData';
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

const WEEKDAY_LABELS_KO = ['일', '월', '화', '수', '목', '금', '토'];

// "2026년 8월 15일 토요일" (node 541:3016) — Figma 목업 문구가 그대로 하드코딩돼 있어서 날짜가
// 절대 안 바뀌는 버그였다(홈 화면 index.tsx의 formatTodayHeading과 동일한 원인으로 이미 한 번
// 고쳤던 것과 같은 패턴). 로컬 Date에서 직접 계산해 오늘 날짜가 그대로 반영되게 한다.
function formatTodayHeadingFull(): string {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY_LABELS_KO[now.getDay()]}요일`;
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

// Figma "Ui (복사)" 파일, node-id=694-2660 하단 요일 배지 스프라이트 — done/missed/upcoming 세
// 배지가 모두 같은 원본 이미지(imageRef 05d22fc4...)에서 서로 다른 cropTransform으로 잘라낸
// 표정(웃음/울음/무표정)이다. 예전엔 이 세 표정 에셋이 이미 assets에 준비돼 있었는데도 실제
// 렌더링에서는 상태와 무관하게 항상 웃는 얼굴(-face.png) 하나만 썼다 — 여기서 상태별로 바로
// 연결한다.
const WEEK_STREAK_FACE_IMAGES: Record<WeekStreakState, number> = {
  done: require('@/assets/images/figma-icon-my-streak-face.png'),
  missed: require('@/assets/images/figma-icon-my-streak-face-cry.png'),
  upcoming: require('@/assets/images/figma-icon-my-streak-face-neutral.png'),
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
// 아이폰16 규격 맞추기(1차) — "오늘의 투두" 진행 바(todoProgressTrack)를 370으로 넓힌 것과
// 정확히 같은 가로 길이가 되도록 330→370(비율 370/330≈1.1212)으로 키우고, 세로(THICKNESS/
// ROWMID_TOP/ROW3_TOP과 그로부터 파생되는 두 연결 구간 높이)도 전부 같은 비율로 같이 키워
// 뱀 모양 비율이 원본과 동일하게 유지되도록 했다. "^" 경계 표시나 채움 계산은 전부 이 상수들을
// 참조하는 수식이라(pointAtDistance/LevelSegmentBar) 상대적 위치·로직은 자동으로 그대로 유지된다.
const EXP_BAR_ROW_WIDTH = 370;
const EXP_BAR_THICKNESS = 11;
const EXP_BAR_ROW1_TOP = 0;
const EXP_BAR_ROWMID_TOP = 53;
const EXP_BAR_ROW3_TOP = 103;
const EXP_BAR_RIGHT_CONNECTOR_HEIGHT = EXP_BAR_ROWMID_TOP + EXP_BAR_THICKNESS; // row1 오른쪽 끝 → 가운데 줄 오른쪽 끝
const EXP_BAR_LEFT_CONNECTOR_HEIGHT = EXP_BAR_ROW3_TOP + EXP_BAR_THICKNESS - EXP_BAR_ROWMID_TOP; // 가운데 줄 왼쪽 끝 → row3 왼쪽 끝
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

  // 투두 탭에서 exp를 얻고 이 탭으로 돌아왔을 때 레벨/exp가 곧바로 안 바뀌면 사용자가 버그로
  // 오해할 수 있어, todoChangedSignal이 바뀔 때마다(=투두 체크 토글이 성공할 때마다) 다시
  // 조회한다 — 홈 화면(index.tsx)도 동일한 패턴을 쓴다.
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

          {/* 날짜 표시 (node 541:3017) — 좌우 화살표(node 541:3016/3019)는 탭해도 아무 동작이
              없는 장식용이라 제거했다(실제 날짜별로 넘겨볼 데이터 자체가 없음). 오늘 날짜는
              하드코딩 문자열이 아니라 로컬 Date에서 직접 계산한다(위 formatTodayHeadingFull 참고). */}
          <ThemedText style={styles.dateText}>{formatTodayHeadingFull()}</ThemedText>

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
                      source={WEEK_STREAK_FACE_IMAGES[day.state]}
                      style={styles.weekStreakFace}
                      contentFit="contain"
                    />
                  </View>
                  <Text style={[styles.weekStreakLabel, { color: colors.ring }]}>{day.label}</Text>
                </View>
              );
            })}
          </View>

          {/* "+ exp" 섹션 제목 (node 541:3021) */}
          <Text style={styles.expSectionTitle}>+ exp</Text>
          {/* EXP 구간 막대 (node 541:3024~3034) — 위 LevelSegmentBar 주석 참고, 실 레벨(level) 사용 */}
          <LevelSegmentBar level={level} progressPercent={expDisplay.percent} />
          {/* 다음 레벨까지 남은 exp — Figma 노드 없음. nextLevelExp가 null(만렙)이면 "MAX 레벨"로
              방어한다(출석체크 팝업(attendance-flow.tsx)의 동일 규칙과 같은 calculateRemainingExp
              사용, api/game.ts). 로딩 중엔 아무것도 보여주지 않는다(어중간한 값을 보여주지 않기 위함). */}
          {profileState.status === 'available' && (
            <ThemedText style={styles.expRemainingText}>
              {remainingExp === null ? 'MAX 레벨' : `다음 레벨까지 ${remainingExp}exp`}
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
        </View>
      </View>
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
  // 톱니바퀴 아이콘 (node 541:3039, w:24 h:23)
  // 아이폰16 규격 맞추기(7차) — left를 344→362로 옮겨, 오른쪽 끝(362+24=386)이 아래
  // todoProgressTrack의 오른쪽 끝(16+370=386)과 정확히 일치하도록 맞췄다.
  settingsButton: {
    position: 'absolute',
    left: 362,
    top: 34,
  },
  settingsIcon: {
    width: 24,
    height: 23,
  },
  // "LEVEL. 4" (node 541:3037, x:143 y:39 w:137.72, 중앙 정렬) — 전체 폭 기준으로 중앙 정렬한다.
  // 아이폰16 규격 맞추기(7차) — top을 39→34로 옮겨 settingsButton의 top(34)과 정확히 일치시켰다.
  // (8차) 1.5mm(9pt) 위로(34→25) 당겼다가, (9차) 0.5mm(3pt) 다시 아래로(25→28) 내렸다 —
  // settingsButton은 두 요청 다 포함되지 않아 여전히 34 그대로라, 7차에서 맞춘 정렬은 계속
  // 어긋난 상태다(levelTitle:28 vs settingsButton:34). 정렬을 유지하려면 settingsButton도
  // 같이 옮겨야 한다.
  levelTitle: {
    position: 'absolute',
    left: 0,
    top: 28,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  // "내 루틴을 찾았어요!" (node 541:3038, x:123 y:83 w:178, Pretendard SemiBold 21.7px)
  // ⚠️ 아이폰16 규격 맞추기(7차) — 요청은 24pt(83→59) 위로 당기는 것이었지만, 바로 위
  // levelTitle이 이번 라운드에 top:34로 옮겨져 바닥이 34+40=74가 됐다. 24pt 그대로 적용하면
  // (59) levelTitle과 15px 겹친다. 2px 여유만 남기는 선까지만(7pt, 83→76) 당겼다.
  levelSubtitle: {
    position: 'absolute',
    left: 0,
    top: 76,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 29,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: Colors.primaryDark,
  },
  // MY-01 검증 신뢰도 문구 — Figma 노드 없음, levelSubtitle 바로 아래 여백에 얹는다.
  // ⚠️ 아이폰16 규격 맞추기(7차) — 요청은 18pt(109→91) 위로 당기는 것이었지만, 위
  // levelSubtitle의 바닥이 76+29=105라 18pt 그대로 적용하면(91) 14px 겹친다. 2px 여유만
  // 남기는 선까지만(2pt, 109→107) 당겼다 — levelSubtitle이 이미 거의 여유 없이 붙어서 이번
  // 라운드에 더 못 밀었다.
  trustLevelText: {
    position: 'absolute',
    left: 0,
    top: 107,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '500',
    color: 'rgba(3, 25, 73, 0.55)',
  },
  // 캐릭터 (node 551:1316) — 그림자(node 541:2984)를 지운 뒤 위치를 다시 잡았다. 레벨별 이미지의
  // 가로세로 비율이 서로 달라(1·2는 눕고 넓은 포즈, 3은 서 있는 세로 포즈 등) contentFit="contain"이
  // 안쪽에서 알아서 맞추므로, 박스 자체는 width만 넉넉히(캔버스 402 기준 좌우 22px 여백,
  // weekStreakRow와 동일한 여백 관례) 잡았다.
  // ⚠️ 아이폰16 규격 맞추기(7차) — 요청은 24pt(134→110) 위로 당기는 것이었지만, 위
  // trustLevelText 바닥이 107+17=124라 24pt 그대로 적용하면(110) 14px 겹친다. 2px 여유만
  // 남기는 선까지만(8pt, 134→126) 당겼다 — 아래 dateText(top:386)와는 여전히 10px 여유가
  // 있어 안전하다.
  characterImage: {
    position: 'absolute',
    left: 22,
    top: 126,
    width: 358,
    height: 250,
  },
  // 오늘 날짜 (node 541:3016, x:98.69 y:396.74 w:228) — Figma는 22.6px를 쓰지만 그대로 옮기면
  // 폭 228px에 두 줄로 넘어간다. 폰트를 17→20으로 키우면서 같은 이유로 폭도 240→300으로 같이
  // 넓혀야 한 줄에 계속 들어간다(캔버스 402 기준 정중앙 유지, left = (402-300)/2 = 51).
  // fontSize는 1차 때부터 이미 20이라 6차 요청("정확히 20pt")은 이미 충족된 상태 — 그대로 뒀다.
  // ⚠️ 아이폰16 규격 맞추기(6차) — 요청은 36pt(398→362) 위로 당기는 것이었지만, 바로 위
  // characterImage가 당시 top:134+height:250로 정확히 y:384까지 차지하고 있어서(정확한 값)
  // 36pt를 그대로 적용하면 22px 겹친다. characterImage는 이번 요청 범위 밖이라 건드리지 않고,
  // 그 바로 아래 2px 여유만 남기는 선까지만(12pt, 398→386) 당겼다.
  // ⚠️ (10차) 2mm(12pt) 추가로 위로(386→374) 당기는 요청이었지만, 7차에서 characterImage가
  // top:126으로 올라와 바닥이 126+250=376이 됐다(384→376). 12pt 그대로 적용하면(374) 2px
  // 겹친다. 2px 여유만 남기는 선까지만(8pt, 386→378) 당겼다.
  // 0.3mm(≈2pt) 아래로(378→380) 내렸다 — 폰트는 요청하신 20pt가 1차 때부터 이미 적용된
  // 상태라 변경 없음. 위 characterImage(바닥376)와는 4px 여유가 있어 안전하다.
  // fontSize를 20→22로 키웠다(요청). lineHeight도 같은 비율(1.2배)로 24→26 같이 키웠다.
  // top은 이번 요청에 없어 380 그대로라, 아래 weekStreakRow와의 여유가 5px→3px로 줄었다.
  dateText: {
    position: 'absolute',
    left: 51,
    top: 380,
    width: 300,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 26,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#000000',
  },
  // 이번 주 출석 스트릭 (node 541:2985, x:28 y:434 w:358.06) — 요일 7개를 flex row로 균등 배치한다
  // (Figma 원본은 요일마다 좌표가 조금씩 불균일하지만 눈에 띄지 않는 차이라 통일했다).
  // ⚠️ 아이폰16 규격 맞추기(4차) — 요청은 24pt(434→410) 위로 당기는 것이었지만, dateText가
  // top:398 + lineHeight:24로 정확히 y:422까지 차지하고 있어서(추정치가 아니라 정확한 값) 24pt를
  // 그대로 적용하면 이 그룹(markerSlot부터 시작)이 dateText와 12px 겹친다. dateText는 이번
  // 요청 범위 밖이라("이 3가지 외의 다른 요소는 건드리지 마") 건드리지 않고, dateText 바로
  // 아래 4px 여유만 남기는 선까지만(8pt, 434→426) 당겼다.
  // ⚠️ (5차) 이번 요청은 추가로 12pt(426→414) 더 당기는 것이었으나, top을 그대로 유지했다 —
  // 이 그룹의 세로 높이(markerSlot14+circle marginTop2+circle45+label marginTop6+label 한 줄
  // ≈85)가 위 dateText 바닥(정확히 422)과 아래 expSectionTitle(이번 5차로 507) 사이 공간
  // (507-422=85)과 이미 거의 정확히 같아서, 위아래 어느 쪽으로도 더 밀 여유가 없다(한쪽으로
  // 밀면 반드시 다른 쪽과 겹친다). 더 당기려면 dateText를 위로 옮기거나 expSectionTitle을
  // 아래로 내리는 것 중 하나가 필요한데 둘 다 이번 요청 3가지 밖이라 그대로 뒀다.
  // ⚠️ (6차) 이번 라운드에서 dateText가 386으로 12pt 올라가면서(바닥이 422→410) 위쪽으로 여유가
  // 다시 생겼다. 요청은 18pt(426→408)였지만, dateText 새 바닥(410)+2px 마진 = 412가 상한이라
  // 14pt(426→412)까지만 당겼다 — expSectionTitle(507) 쪽과는 여전히 10px 여유가 있어 안전하다.
  // (10차 이후) dateText가 378까지 더 올라와(바닥 402) 여유가 늘어, 0.5mm(3pt, 412→409)를
  // 전부 그대로 적용했다 — 위(dateText 바닥 402, 여유7)/아래(expSectionTitle 507, 여유13) 둘 다 안전.
  // 아이폰16 규격 맞추기(8차) — left/width를 28/358 → 16/370으로 바꿔 좌우 끝을 todoProgressTrack
  // (left:16, width:370, 우측 끝 386)과 정확히 맞췄다. 이미 justifyContent:'space-between'을
  // 쓰고 있어서 폭만 넓히면 7개 weekStreakDay(각각 width:46, 안 건드림) 사이 간격이 자동으로
  // 균등하게 늘어난다 — 별도 로직 변경 없이 폭 값만으로 요청 2번(간격 균등 확대)까지 해결됨.
  // 세로 배치(markerSlot/circle/label 순서·간격)는 전혀 안 건드렸다.
  // ⚠️ 0.3mm(≈2pt) 위로(409→407) 당겼다. 같은 요청에서 dateText 폰트도 22pt로 커져 바닥이
  // 406이 돼서, 이 그룹과의 간격이 1px까지 줄었다 — 겹치진 않지만 매우 타이트하니 실기기에서
  // 꼭 확인 필요.
  weekStreakRow: {
    position: 'absolute',
    left: 16,
    top: 407,
    width: 370,
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
    fontSize: 15,
    fontFamily: PRETENDARD_SEMIBOLD,
  },
  // "+ exp" (node 541:3021) — 폰트 3pt 확대(17→20). left도 34→14로 당겨서, 아래로 넓어진
  // expBarWrapper(왼쪽이 36→16으로 이동)와 같은 상대 오프셋(-2)을 유지하며 정렬을 맞췄다.
  // 아이폰16 규격 맞추기(3차) — top을 12pt(531→519) 위로 당겼다. (4차) 9pt(519→510) 추가로
  // 당겼다. (5차) expBarWrapper와 같이 3pt(510→507) 추가로 당겼다(둘 사이 간격은 그대로).
  expSectionTitle: {
    position: 'absolute',
    left: 14,
    top: 507,
    fontSize: 20,
    fontFamily: PRESS_START_2P,
    color: '#000000',
  },
  // EXP 뱀 모양 막대 자리 (node 541:3024~3032 전체를 감싸는 영역) — 안의 5개 조각(row1/
  // rightConnector/rowMid/leftConnector/row3)은 전부 이 안에서 로컬 좌표로 절대 배치된다
  // (LevelSegmentBar 위 주석 참고). left를 36→16으로 옮겨 아래 todoProgressTrack과 같은 폭
  // (370)으로 화면 중앙에 정렬했다(원래 36 그대로 두면 폭이 늘어난 만큼 우측이 캔버스 밖으로
  // 넘친다). 아이폰16 규격 맞추기(3차) — top을 30pt(574→544) 위로 당겼다. 이 이동으로 row3의
  // 실제 절대 위치가 647~658로 올라가서, 아래 expRemainingText(2차에서 겹침 우려가 있었던
  // 667)와의 간격이 오히려 넓어져 2차 때 남겨둔 겹침 우려가 해소됐다(아래 expRemainingText
  // 주석 참고). (4차) 6pt(544→538) 추가로 당겼다. (5차) expSectionTitle과 같이 3pt(538→535)
  // 추가로 당겼다(둘 사이 간격은 그대로).
  expBarWrapper: {
    position: 'absolute',
    left: 16,
    top: 535,
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
  // "오늘의 투두    n / 5" (node 541:3022, Pretendard SemiBold 19px)
  // 다음 레벨까지 남은 exp — Figma 노드 없음. 2차에서 12pt(679→667) 당겼을 때 exp 바 row3
  // (당시 절대 위치 677~688)와 겹칠 수 있다고 남겨뒀었는데, 3차에서 exp 바 자체가 30pt 위로
  // 올라가면서(row3가 이제 647~658) 이 텍스트(top:661)와 다시 안 겹치게 됐다 — 3pt 여유.
  // top을 6pt(667→661) 위로 추가로 당겼다.
  expRemainingText: {
    position: 'absolute',
    left: 16,
    top: 661,
    width: EXP_BAR_ROW_WIDTH,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '600',
    color: 'rgba(3, 25, 73, 0.55)',
  },
  // 아이폰16 규격 맞추기(2차) — left를 33→16으로 옮겨 아래 todoProgressTrack(left:16)과 좌측
  // 정렬선을 맞췄고, top도 3pt(695→692) 위로 당겼다. (3차) top을 2pt(692→694) 아래로 내렸다.
  // (5차) todoProgressTrack과 같이 3pt(694→691) 위로 당겼다(둘 사이 간격·좌측 정렬은 그대로).
  todoSummaryText: {
    position: 'absolute',
    left: 16,
    top: 691,
    fontSize: 22,
    lineHeight: 26,
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
  // 오늘의 투두 진행 바 (node 541:3023/3025)
  // 아이폰16 규격 맞추기(1차) — 좌우 여백을 33/37→16/16으로 줄여 폭 332→370으로 넓혔다(가로
  // 중앙 정렬 유지). 아래 LevelSegmentBar도 이 폭(EXP_BAR_ROW_WIDTH)에 맞춰 같이 넓혔다.
  // (2차) top을 12pt(739→727) 위로 당겼다. (5차) todoSummaryText와 같이 3pt(727→724) 위로 당겼다.
  todoProgressTrack: {
    position: 'absolute',
    left: 16,
    top: 724,
    width: 370,
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
  // 0.3mm(≈2pt) 아래로(754→756) 내렸다.
  syncStatusText: {
    position: 'absolute',
    left: 0,
    top: 756,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  // 0.3mm(≈2pt) 아래로(771→773) 내렸다 — syncStatusText와 같이 이동해 둘 사이 간격은 그대로.
  // 아이폰16 규격 맞추기 — 1pt(0.2mm) 아래로 내리는 요청, 반올림해 1pt 적용(773→774). 위
  // syncStatusText(top:756, bottom≈775)와의 간격은 오히려 넓어지는 방향이라 겹칠 위험이
  // 줄어들 뿐 늘지 않는다.
  syncPolicyText: {
    position: 'absolute',
    left: 0,
    top: 774,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 16,
    fontWeight: '500',
    color: '#9E9E9E',
  },
});
