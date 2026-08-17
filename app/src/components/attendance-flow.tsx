import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateRemainingExp, type AttendanceExpInfo, type AttendanceWeekDay } from '@/api/game';
import { Colors } from '@/constants/colors';
import { useDesignScale } from '@/hooks/use-design-scale';

// ATT-01 — 온보딩 완료 직후, 홈 화면 진입 전에 한 번 보여주는 "오늘 출석 완료" 축하 화면.
// Figma 'Ui (복사)' 파일 노드 501:292("iPhone 17 - 7")를 Figma REST API로 직접 읽어와
// 온보딩(onboarding-flow.tsx)과 동일하게 402x874 고정 캔버스로 좌표를 그대로 옮긴 것.
// 좌표는 모두 프레임(node 501:292) 원점 기준 절대값.
//
// 요일별 체크/X 표시는 HOME-04(POST /api/v1/users/me/attendance) 응답의 weekDays를 그대로
// 그린다 — 과거엔 streakCount(연속 "검증" 횟수, 출석과 다른 개념)를 week-streak.ts로 이번 주에
// 투영해 흉내 냈었는데, 그 값은 이 화면이 보여줘야 할 "출석" 여부와 무관해서 월요일 첫 출석에도
// X가 뜨는 버그가 있었다(신규 유저는 streakCount가 0이라 아무 요일도 "포함된 것으로" 계산되지
// 않았음). weekDays는 서버가 이미 ATTENDED/MISSED/UPCOMING을 판정해 내려주므로 그대로 옮기기만
// 하면 된다 — MISSED(진짜 빠뜨림)와 UPCOMING(아직 오지 않은 날)을 같은 빈 칸으로 그리면 안 된다는
// 게 API 쪽 명시 규칙이라, UPCOMING은 아이콘 없이 빈 원으로 둬서 "실패"처럼 보이지 않게 한다.
//
// exp(HOME-04 응답의 exp)는 optional prop으로 받는다 — 이 화면 자체를 호출부(_layout.tsx)가
// checkedIn: true일 때만 마운트하므로 항상 채워지지만, 방어적으로 없을 때는 경험치 줄을 렌더하지
// 않는다.
//
// 우상단 X 버튼(node 541:3063, x:345 y:37 w:20 h:19)을 눌러야만 닫힌다 — 화면 전체 탭으로
// 넘어가던 이전 동작(별도 CTA 없는 구 시안 501:292 기준)을 최신 시안(541:3041)에 맞춰 교체했다.
//
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링).
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

const ATTENDANCE_TITLE_COLOR = '#4681F3';
const ATTENDANCE_BODY_COLOR = '#020202';
const ATTENDANCE_LABEL_COLOR = '#B5B8BD';
const ATTENDANCE_DAY_ATTENDED_BG = '#4882EA';
const ATTENDANCE_DAY_PENDING_BG = '#B3B7C0';

// Figma 지정 폰트(Pretendard)가 로드돼 있지 않으면 시스템 폰트가 더 넓게 렌더돼 타이틀/설명이
// Figma 박스 폭보다 줄바꿈이 늘어난다(온보딩(onboarding-flow.tsx)에서 겪은 것과 동일한 문제) —
// 그때 받아둔 폰트 파일을 이 화면에도 그대로 재사용한다.
const PRETENDARD_REGULAR = 'Pretendard-Regular';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const ATTENDANCE_FONTS = {
  [PRETENDARD_REGULAR]: require('@/assets/fonts/Pretendard-Regular.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
};

// 요일 라벨(node 509:297 등) x좌표는 완전히 균등하지 않아(약 41.2px 간격, 소수점 오차) Figma
// 값을 그대로 옮겼다. 상태(ATTENDED/MISSED/UPCOMING)는 weekDays prop을 그대로 순서대로 대응시킨다
// (서버 응답도 월요일부터 7칸 고정이라 인덱스로 zip해도 안전) — 여기 남은 건 순수 레이아웃
// 좌표뿐이다.
const ATTENDANCE_DAY_POSITIONS = [
  { label: '월', labelX: 70.17, circleX: 61 },
  { label: '화', labelX: 111, circleX: 102.25 },
  { label: '수', labelX: 152.68, circleX: 143.51 },
  { label: '목', labelX: 193.93, circleX: 184.77 },
  { label: '금', labelX: 235.19, circleX: 226.02 },
  { label: '토', labelX: 276.44, circleX: 267.28 },
  { label: '일', labelX: 317.7, circleX: 308.53 },
] as const;

export function AttendanceFlow({
  onComplete,
  exp,
  weekDays,
}: {
  onComplete: () => void;
  exp?: AttendanceExpInfo;
  /** HOME-04 응답의 weekDays. 항상 월~일 7칸(서버가 보장) — ATTENDANCE_DAY_POSITIONS와 인덱스로 zip한다 */
  weekDays: AttendanceWeekDay[];
}) {
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [fontsLoaded] = useFonts(ATTENDANCE_FONTS);
  const remainingExp = exp ? calculateRemainingExp(exp) : null;
  const attendanceDays = ATTENDANCE_DAY_POSITIONS.map((day, index) => ({
    ...day,
    status: weekDays[index]?.status ?? 'UPCOMING',
  }));

  // 폰트 로드 전엔 흰 배경만 렌더한다 — 시스템 폰트로 잠깐 렌더돼 줄바꿈이 튀는 걸 막는다.
  if (!fontsLoaded) {
    return <SafeAreaView style={styles.screen} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
          {/* X 버튼(node 541:3063, x:345 y:37 w:20 h:19) — 이 화면을 닫는 유일한 인터랙션 */}
          <Pressable onPress={onComplete} hitSlop={12} style={styles.closeButton}>
            <Image
              source={require('@/assets/images/figma-icon-attendance-close.svg')}
              style={styles.closeIcon}
              contentFit="contain"
            />
          </Pressable>

          {/* "image 78" (node 509:293, x:135 y:253 w:132 h:123) — 파란 체크 배지 히어로 이미지 */}
          <Image
            source={require('@/assets/images/figma-icon-attendance-hero.png')}
            style={styles.heroImage}
            contentFit="contain"
          />

          {/* "오늘 출석 완료" (node 509:295, x:116 y:389 w:170 h:36) */}
          <Text style={styles.title}>오늘 출석 완료</Text>

          {/* 설명 (node 509:296, x:88 y:437 w:225 h:56) */}
          <Text style={styles.body}>매일 방문하면{'\n'}포인트를 더 많이 받을 수 있어요</Text>

          {/* HOME-04 실데이터: 획득 exp + 다음 레벨까지 남은 exp. Figma에 없는 요소라 body(~493)와
              요일 라벨(542) 사이 여백에 작은 보조 텍스트로 얹는다. exp가 없으면(방어) 렌더하지 않는다. */}
          {exp && (
            <Text style={styles.expInfo}>
              {`+${exp.gained} EXP`}
              {remainingExp === null ? ' · MAX 레벨' : ` · 다음 레벨까지 ${remainingExp} EXP`}
            </Text>
          )}

          {/* 요일 라벨 + 출석 원 (node 509:297~339, y:542/570.65). UPCOMING은 아이콘 없이 빈
              회색 원만 그린다 — MISSED(X 아이콘)와 시각적으로 구분해야 "아직 안 온 날"이
              "빠뜨린 날"로 오인되지 않는다. */}
          {attendanceDays.map((day) => (
            <View key={day.label}>
              <Text style={[styles.dayLabel, { left: day.labelX }]}>{day.label}</Text>
              <View
                style={[
                  styles.dayCircle,
                  { left: day.circleX, backgroundColor: day.status === 'ATTENDED' ? ATTENDANCE_DAY_ATTENDED_BG : ATTENDANCE_DAY_PENDING_BG },
                ]}>
                {day.status !== 'UPCOMING' && (
                  <Image
                    source={
                      day.status === 'ATTENDED'
                        ? require('@/assets/images/figma-icon-attendance-check.svg')
                        : require('@/assets/images/figma-icon-attendance-pending.svg')
                    }
                    style={day.status === 'ATTENDED' ? styles.dayIconCheck : styles.dayIconPending}
                    contentFit="contain"
                  />
                )}
              </View>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  // X 버튼(node 541:3063, x:345 y:37 w:20 h:19)
  closeButton: {
    position: 'absolute',
    left: 345,
    top: 37,
  },
  closeIcon: {
    width: 20,
    height: 19,
  },
  // "image 78" (node 509:293, x:135 y:253 w:132 h:123)
  heroImage: {
    position: 'absolute',
    left: 135,
    top: 253,
    width: 132,
    height: 123,
  },
  // "오늘 출석 완료" (node 509:295, x:116 y:389 w:170 h:36, Pretendard SemiBold 30px)
  title: {
    position: 'absolute',
    left: 116,
    top: 389,
    width: 170,
    textAlign: 'center',
    fontSize: 30,
    fontFamily: PRETENDARD_SEMIBOLD,
    lineHeight: 36,
    color: ATTENDANCE_TITLE_COLOR,
  },
  // 설명 (node 509:296, x:88 y:437 w:225 h:56, Pretendard Regular 18px, lineHeight:28px)
  body: {
    position: 'absolute',
    left: 88,
    top: 437,
    width: 225,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: PRETENDARD_REGULAR,
    lineHeight: 28,
    color: ATTENDANCE_BODY_COLOR,
  },
  // HOME-04 exp 보조 텍스트 — Figma 노드 없음, body(top:437 h:56)와 요일 라벨(top:542) 사이 여백에 배치
  expInfo: {
    position: 'absolute',
    left: 0,
    top: 508,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: Colors.accentBlue,
  },
  // 요일 라벨(node 509:297 등, y:542 w:15 h:20, Pretendard SemiBold 16.59px) — left는 인라인으로 개별 지정
  dayLabel: {
    position: 'absolute',
    top: 542,
    width: 15,
    textAlign: 'center',
    fontSize: 16.59,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: ATTENDANCE_LABEL_COLOR,
  },
  // 출석 원(node 509:298 등, y:570.65 w:32.47 h:32.47, radius: 원형) — left/backgroundColor는 인라인
  dayCircle: {
    position: 'absolute',
    top: 570.65,
    width: 32.47,
    height: 32.47,
    borderRadius: 16.24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 체크 아이콘(node 509:302 등, w:18.72 h:12.99) — dayCircle 안에서 중앙 정렬
  dayIconCheck: {
    width: 18.72,
    height: 12.99,
  },
  // X 아이콘(node 509:304 등, w:12.61 h:12.61) — dayCircle 안에서 중앙 정렬
  dayIconPending: {
    width: 12.61,
    height: 12.61,
  },
});
