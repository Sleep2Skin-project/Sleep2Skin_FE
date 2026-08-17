import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDesignScale } from '@/hooks/use-design-scale';

// "수면 점수가 올랐을 때/90점 이상일 때" 뜨는 게이미케이션(경험치) 팝업. Figma 'Ui (복사)' 파일
// 노드 513:340("리포트- 일간") 위에 겹쳐 있던 모달 그룹(node 516:953, 프레임 원점 기준
// x:-18 y:423) 좌표를 그대로 옮긴 것 — 원래는 일간 리포트 화면 전용으로 그려졌지만, 실제 트리거가
// POST /api/v1/sleep/sessions(앱 시작마다 호출)로 옮겨가면서 지금은 src/app/_layout.tsx가 소유
// 하고 앱 시작 시 그 화면 위(대체로 홈 탭) 오버레이로 띄운다. RN Modal로 화면 전체를 별도 레이어로
// 덮는 구조라 백드롭이 "지금 떠 있는 화면을 반투명 dim" 하는 범용 구조라서 뒤에 어느 화면이 있어도
// 그대로 쓸 수 있다 — 402x874 고정 캔버스 + useDesignScale 비율 스케일링도 그대로다.
//
// score/expGained/dateLabel은 모두 그 API 응답의 실값이다(exp.reasons 중
// SLEEP_SCORE_IMPROVED/SLEEP_SCORE_HIGH 합산, sleep.sleepScore, sleepDate) — 더 이상 목업이
// 아니다(_layout.tsx 참고).
//
// Figma는 카드 배경에 blur(5.11px) 프로스티드 글라스 효과를 쓰지만, RN 기본만으로는 재현이
// 번거로워 불투명 흰 배경 + 그림자로 근사했다(다른 팝업 모달들과 동일한 절충).
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

const CARD_BG_DIM = 'rgba(0, 0, 0, 0.2)';
const CARD_SCORE_COLOR = '#171717';
const CARD_DATE_COLOR = '#727272';
const CARD_BODY_COLOR = '#3B3B3B';
const CARD_PILL_BG = '#DFEAFF';
const CARD_PILL_TEXT = '#1B74D4';
const CARD_EXP_COLOR = '#3366FF';
const CARD_CLOSE_BTN_BG = '#008DFF';

const PRETENDARD_REGULAR = 'Pretendard-Regular';
const PRETENDARD_MEDIUM = 'Pretendard-Medium';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const PRESS_START_2P = 'PressStart2P-Regular';
const GAMIFICATION_MODAL_FONTS = {
  [PRETENDARD_REGULAR]: require('@/assets/fonts/Pretendard-Regular.otf'),
  [PRETENDARD_MEDIUM]: require('@/assets/fonts/Pretendard-Medium.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
  [PRESS_START_2P]: require('@/assets/fonts/PressStart2P-Regular.ttf'),
};

export function SleepScoreGamificationModal({
  score,
  expGained,
  dateLabel,
  onClose,
}: {
  score: number;
  expGained: number;
  dateLabel: string;
  onClose: () => void;
}) {
  const [fontsLoaded] = useFonts(GAMIFICATION_MODAL_FONTS);
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  // 폰트 로드 전엔 아예 렌더하지 않는다 — 시스템 폰트로 잠깐 렌더돼 타이틀이 줄바꿈되는 걸 막는다.
  if (!fontsLoaded) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* 화면 전체를 덮는 반투명 백드롭 (node 514:821, rgba(0,0,0,0.2)) — 탭하면 닫힌다. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* HOME(index.tsx)·온보딩과 동일한 402x874 고정 캔버스 — 카드 좌표(x:20 y:423)를
            Figma 그대로 쓴다. 카드 바깥 영역은 투명해서 뒤의 리포트 화면이 dim된 채로 비친다. */}
        <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
          <View style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
            {/* 카드 배경(node 516:936, x:20 y:423 w:364 h:429, radius:42) — 탭해도 안 닫히도록
                별도 Pressable로 감싼다(이벤트 버블 차단). 자식들은 카드에 중첩시키지 않고 캔버스
                기준 절대좌표를 그대로 써서 Figma 구조(그룹의 형제 레이어)와 동일하게 맞춘다. */}
            <Pressable style={styles.card} onPress={() => {}} />

            <Image
              source={require('@/assets/images/figma-icon-sleep-score-check.svg')}
              style={styles.checkIcon}
              contentFit="contain"
            />

            <Text style={styles.title}>
              <Text style={styles.titleAccent}>Wow!</Text> 수면 점수가 올랐어요
            </Text>

            <Image
              source={require('@/assets/images/figma-icon-sleep-score-hero.png')}
              style={styles.heroImage}
              contentFit="contain"
            />
            <Text style={styles.dateLabel}>{dateLabel} 기준</Text>
            <Text style={styles.scoreText}>
              {score}
              <Text style={styles.scoreUnit}>점</Text>
            </Text>
            <View style={styles.insurancePill}>
              <Text style={styles.insurancePillText}>보험 할인 정보</Text>
              <Text style={styles.insurancePillChevron}>›</Text>
            </View>

            <Text style={styles.bodyText}>앞으로 더 규칙적인 생활을 통해{'\n'}피부건강을 완전히 회복할 거예요</Text>

            {/* "+ 10 exp" (node 514:820) — Figma가 카드 왼쪽 경계보다 18px 더 왼쪽(x:-18)에서
                시작하도록 배치해뒀는데, 앞의 공백 5칸이 그 여백을 메워 실제 보이는 글자("+")는
                카드 안쪽에서 시작한다(투두 화면의 "+5 exp" 배지와 동일한 트릭). */}
            <Text style={styles.expBadge}>{'     '}+ {expGained} exp</Text>

            <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Text style={styles.closeButtonText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_BG_DIM,
  },
  // 402x874 캔버스 — 카드 바깥은 투명해서 뒤의 리포트 화면이 dim된 채로 비쳐야 하므로
  // backgroundColor를 주지 않는다(다른 화면들의 흰 배경 캔버스와 다른 점).
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    overflow: 'hidden',
  },
  // 카드(node 516:936, x:20 y:423 w:364 h:429, radius:42)
  card: {
    position: 'absolute',
    left: 20,
    top: 423,
    width: 364,
    height: 429,
    backgroundColor: '#FFFFFF',
    borderRadius: 42,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  // 체크 배지 (node 514:800, x:48 y:449 w:32.62 h:32.64)
  checkIcon: {
    position: 'absolute',
    left: 48,
    top: 449,
    width: 32.62,
    height: 32.64,
  },
  // "Wow! 수면 점수가 올랐어요" (node 514:801, x:63 y:451 w:324 h:36, Pretendard SemiBold 22.34px, 중앙 정렬)
  title: {
    position: 'absolute',
    left: 63,
    top: 451,
    width: 324,
    textAlign: 'center',
    fontSize: 22.34,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: '#000000',
  },
  titleAccent: {
    fontSize: 24.83,
  },
  // "image 82" 히어로 곡선 그래픽 (node 514:808, x:53.76 y:510.43 w:311.73 h:132.32) — 이 박스
  // 안쪽에 날짜/점수/알약이 겹쳐 올라간다(Figma가 그렇게 겹쳐 배치했다).
  heroImage: {
    position: 'absolute',
    left: 53.76,
    top: 510.43,
    width: 311.73,
    height: 132.32,
  },
  // "26년 8월 14일 기준" (node 514:815, x:156.49 y:550.8 w:105.4 h:15.7, Pretendard Medium 11.16px)
  dateLabel: {
    position: 'absolute',
    left: 156.49,
    top: 550.8,
    width: 105.4,
    textAlign: 'center',
    fontSize: 11.16,
    fontFamily: PRETENDARD_MEDIUM,
    color: CARD_DATE_COLOR,
  },
  // "86점" (node 514:810, x:165.59 y:565.97 w:86.34 h:52.7, Pretendard SemiBold 38.45px, 중앙 정렬)
  scoreText: {
    position: 'absolute',
    left: 165.59,
    top: 565.97,
    width: 86.34,
    textAlign: 'center',
    fontSize: 38.45,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: CARD_SCORE_COLOR,
  },
  scoreUnit: {
    fontSize: 28.84,
    fontFamily: PRETENDARD_MEDIUM,
  },
  // "보험 할인 정보" 알약(node 514:811, x:152.44 y:620.57 w:113.25 h:22.05, bg #DFEAFF radius9.83)
  insurancePill: {
    position: 'absolute',
    left: 152.44,
    top: 620.57,
    width: 113.25,
    height: 22.05,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: CARD_PILL_BG,
    borderRadius: 9.83,
  },
  insurancePillText: {
    fontSize: 9.55,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: CARD_PILL_TEXT,
  },
  insurancePillChevron: {
    fontSize: 12,
    fontFamily: PRETENDARD_SEMIBOLD,
    color: CARD_PILL_TEXT,
  },
  // "앞으로 더 규칙적인 생활을 통해\n피부건강을 완전히 회복할 거예요" (node 514:816, x:126.65
  // y:721.24 w:158.11 h:33.64, Pretendard Regular 10px, lineHeight:15px, 중앙 정렬)
  bodyText: {
    position: 'absolute',
    left: 126.65,
    top: 721.24,
    width: 158.11,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 15,
    fontFamily: PRETENDARD_REGULAR,
    color: CARD_BODY_COLOR,
  },
  // "+ 10 exp" 배지 (node 514:820, x:-18 y:659.57 w:371, Press Start 2P 22.43px) — x가 카드
  // 왼쪽(20)보다 왼쪽인 이유는 위 주석 참고.
  expBadge: {
    position: 'absolute',
    left: -18,
    top: 659.57,
    width: 371,
    fontSize: 22.43,
    fontFamily: PRESS_START_2P,
    color: CARD_EXP_COLOR,
  },
  // "닫기" 버튼 (node 514:793, x:48.16 y:768.34 w:317.33 h:54.94, bg #008DFF radius26)
  closeButton: {
    position: 'absolute',
    left: 48.16,
    top: 768.34,
    width: 317.33,
    height: 54.94,
    borderRadius: 26,
    backgroundColor: CARD_CLOSE_BTN_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontFamily: PRETENDARD_MEDIUM,
    color: '#FFFFFF',
  },
});
