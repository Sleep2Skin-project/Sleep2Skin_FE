import { Modal, Pressable, StyleSheet, Text } from 'react-native';

import { calculateRemainingExp, type AttendanceExpInfo } from '@/api/game';
import { Colors } from '@/constants/colors';

// 경험치(exp) 증감 안내 팝업 — exp 객체를 내려주는 모든 API(HOME-04 출석 체크인, TODO-05 체크리스트
// 상태 변경 등)가 공유하는 단일 UI다. "파싱 코드와 레벨업 연출을 중복 구현하지 말 것"이라는 요구사항에
// 따라 이 컴포넌트 하나가 세 가지 경우(적립/회수/레벨업)를 전부 처리한다.
// exp.gained === 0이면 보여줄 변화가 없으므로 호출부가 애초에 이 컴포넌트를 마운트하지 않아야 한다.
//
// gained가 음수인 "회수"(어뷰징 방지용 되돌리기)도 정상 케이스다 — 에러가 아니므로 색/문구만
// 다르게(축하 톤이 아닌 안내 톤) 보여주고 동일한 컴포넌트로 처리한다. 회수량이 요청한 -5/-35보다
// 작게 올 수 있다(누적 exp가 0 밑으로 안 내려가는 하한 규칙) — 별도 보정 계산 없이 서버가 준
// gained/totalExp를 그대로만 표시한다.
//
// Figma 디자인이 없는 화면이라 다른 팝업들(SleepScoreGamificationModal 등)의 카드+백드롭 패턴만
// 재사용하고 좌표는 자체적으로 잡았다.
export function ExpGainPopup({ exp, onClose }: { exp: AttendanceExpInfo; onClose: () => void }) {
  const isGain = exp.gained > 0;
  const remainingExp = calculateRemainingExp(exp);
  const amountColor = isGain ? Colors.accentBlue : Colors.danger;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {exp.levelUp ? (
            <Text style={styles.levelUpTitle}>레벨업! LV.{exp.level}</Text>
          ) : (
            <Text style={styles.title}>{isGain ? '경험치 획득' : '경험치 회수'}</Text>
          )}

          <Text style={[styles.amount, { color: amountColor }]}>
            {isGain ? '+' : ''}
            {exp.gained} EXP
          </Text>

          {!isGain && <Text style={styles.rollbackNotice}>체크를 해제해서 경험치가 회수됐어요</Text>}

          <Text style={styles.subText}>{remainingExp === null ? 'MAX 레벨' : `다음 레벨까지 ${remainingExp} EXP`}</Text>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Text style={styles.closeButtonText}>확인</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  levelUpTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  amount: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
  },
  rollbackNotice: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B6B6B',
    textAlign: 'center',
  },
  subText: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6B6B',
  },
  pressed: {
    opacity: 0.7,
  },
  closeButton: {
    marginTop: 18,
    width: '100%',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
  },
});
