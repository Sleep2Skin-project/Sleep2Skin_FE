import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { HOME_SUMMARY_MOCK, LEVEL_EXP_MAX, TODO_SUMMARY_MOCK } from '@/constants/mockData';
import { useDesignScale } from '@/hooks/use-design-scale';
import { useChecklistCheckedMap } from '@/hooks/use-checklist-store';

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

// 이번 주 출석 스트릭 띠(node 541:2985) — 게이미케이션/출석 API가 아직 없어(ATT-01
// attendance-flow.tsx와 동일한 사정) Figma 시안이 보여주는 예시 값을 그대로 하드코딩한다.
// 완료(파랑)/오늘(빨강, "N일" + 위쪽 세모 표시)/예정(회색, "N일") 세 상태뿐이고 실제 날짜별
// 로직과는 무관한 정적 목업 — 출석 API가 생기면 이 배열을 응답 데이터로 교체할 것.
type WeekStreakState = 'done' | 'today' | 'upcoming';
const WEEK_STREAK_MOCK: { label: string; state: WeekStreakState }[] = [
  { label: '완료', state: 'done' },
  { label: '완료', state: 'done' },
  { label: '완료', state: 'done' },
  { label: '4일', state: 'today' },
  { label: '5일', state: 'upcoming' },
  { label: '완료', state: 'done' },
  { label: '완료', state: 'done' },
];

const WEEK_STREAK_COLORS: Record<WeekStreakState, { ring: string; circleBg: string }> = {
  done: { ring: '#058BFC', circleBg: '#8ECDFF' },
  today: { ring: '#F91D33', circleBg: '#FFFFFF' },
  upcoming: { ring: '#949597', circleBg: '#FFFFFF' },
};

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

function LevelSegmentBar({ currentLevel }: { currentLevel: number }) {
  const filledLength = (currentLevel / LEVEL_COUNT) * EXP_BAR_TOTAL_LENGTH;

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
        const reached = divider <= currentLevel - 1;
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
  // "오늘의 투두 n/5"는 TODO 탭(todo.tsx)과 같은 공유 store를 봐서, 투두를 체크/해제하면 이
  // 화면을 새로 열지 않아도 실시간으로 값이 바뀐다.
  const checkedMap = useChecklistCheckedMap();
  const completedCount = useMemo(() => Object.values(checkedMap).filter(Boolean).length, [checkedMap]);
  const totalCount = TODO_SUMMARY_MOCK.checklist.length;
  const todoProgress = totalCount === 0 ? 0 : completedCount / totalCount;

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

          {/* "LEVEL. 4" (node 541:3037) — 홈 화면과 같은 mock(HOME_SUMMARY_MOCK.level.current)을 그대로 써서 동기화한다. */}
          <ThemedText style={styles.levelTitle}>LEVEL. {HOME_SUMMARY_MOCK.level.current}</ThemedText>
          {/* "내 루틴을 찾았어요!" (node 541:3038) */}
          <ThemedText style={styles.levelSubtitle}>내 루틴을 찾았어요!</ThemedText>

          {/* 캐릭터 그림자 (node 541:2984, blur 근사) */}
          <View style={styles.characterShadow} />
          {/* 캐릭터 (node 551:1316) — 홈 화면(index.tsx)과 동일한 이미지를 그대로 재사용해
              "홈 화면에 있는 현재 캐릭터"와 항상 같은 그림이 보이도록 한다. */}
          <Image source={require('@/assets/images/figma-character.png')} style={styles.characterImage} contentFit="contain" />

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

          {/* 이번 주 출석 스트릭 (node 541:2985, 정적 목업 — 위 WEEK_STREAK_MOCK 주석 참고) */}
          <View style={styles.weekStreakRow}>
            {WEEK_STREAK_MOCK.map((day, index) => {
              const colors = WEEK_STREAK_COLORS[day.state];
              return (
                <View key={index} style={styles.weekStreakDay}>
                  <View style={styles.weekStreakMarkerSlot}>
                    {day.state === 'today' && <Text style={styles.weekStreakMarker}>▼</Text>}
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
          {/* EXP 구간 막대 (node 541:3024~3034) — 위 LevelSegmentBar 주석 참고 */}
          <LevelSegmentBar currentLevel={HOME_SUMMARY_MOCK.level.current} />

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
  // 캐릭터 그림자 (node 541:2984, x:131 y:362 w:169 h:13, blur 근사)
  characterShadow: {
    position: 'absolute',
    left: 131,
    top: 362,
    width: 169,
    height: 13,
    borderRadius: 7,
    backgroundColor: 'rgba(179, 204, 250, 0.5)',
  },
  // 캐릭터 (node 551:1316, x:41 y:90 w:319 h:257) — figma-character.png는 홈 화면과 동일 이미지
  characterImage: {
    position: 'absolute',
    left: 41,
    top: 90,
    width: 319,
    height: 257,
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
});
