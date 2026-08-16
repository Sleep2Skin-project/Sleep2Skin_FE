import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { calculateRemainingExp, type AttendanceExpInfo } from '@/api/game';
import { Colors } from '@/constants/colors';
import { useDesignScale } from '@/hooks/use-design-scale';
import { isWeekdayInTrailingStreak, toMondayFirstWeekdayIndex } from '@/utils/week-streak';

// ATT-01 — 온보딩 완료 직후, 홈 화면 진입 전에 한 번 보여주는 "오늘 출석 완료" 축하 화면.
// Figma 'Ui (복사)' 파일 노드 501:292("iPhone 17 - 7")를 Figma REST API로 직접 읽어와
// 온보딩(onboarding-flow.tsx)과 동일하게 402x874 고정 캔버스로 좌표를 그대로 옮긴 것.
// 좌표는 모두 프레임(node 501:292) 원점 기준 절대값.
//
// 요일별 체크/X 표시는 HOME-04(POST /api/v1/users/me/attendance) 응답의 streakCount를
// week-streak.ts(isWeekdayInTrailingStreak)로 이번 주 월~일에 투영해 실연동한다(my.tsx의
// "이번 주 출석 스트릭"과 같은 계산, 자세한 설명은 week-streak.ts 상단 주석 참고). 이 화면은
// checkedIn: true일 때만 마운트되므로 오늘은 항상 포함돼 체크로 보인다.
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
// 값을 그대로 옮겼다. attended 여부는 렌더링 시 streakCount로부터 계산해서 채운다(아래 컴포넌트
// 참고) — 여기 남은 건 순수 레이아웃 좌표뿐이다.
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
  streakCount,
}: {
  onComplete: () => void;
  exp?: AttendanceExpInfo;
  streakCount: number;
}) {
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [fontsLoaded] = useFonts(ATTENDANCE_FONTS);
  const remainingExp = exp ? calculateRemainingExp(exp) : null;
  const todayIndex = toMondayFirstWeekdayIndex(new Date());
  const attendanceDays = ATTENDANCE_DAY_POSITIONS.map((day, index) => ({
    ...day,
    attended: isWeekdayInTrailingStreak(index, todayIndex, streakCount),
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

          {/* 요일 라벨 + 출석 원 (node 509:297~339, y:542/570.65) */}
          {attendanceDays.map((day) => (
            <View key={day.label}>
              <Text style={[styles.dayLabel, { left: day.labelX }]}>{day.label}</Text>
              <View
                style={[
                  styles.dayCircle,
                  { left: day.circleX, backgroundColor: day.attended ? ATTENDANCE_DAY_ATTENDED_BG : ATTENDANCE_DAY_PENDING_BG },
                ]}>
                <Image
                  source={
                    day.attended
                      ? require('@/assets/images/figma-icon-attendance-check.svg')
                      : require('@/assets/images/figma-icon-attendance-pending.svg')
                  }
                  style={day.attended ? styles.dayIconCheck : styles.dayIconPending}
                  contentFit="contain"
                />
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
