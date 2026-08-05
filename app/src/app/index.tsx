import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelfieVerificationFlow } from '@/components/selfie-verification-flow';
import { SleepDetailModal } from '@/components/sleep-detail-modal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';

// HOME — Figma 'Ui' 파일 노드 187:2673("홈 화면")을 Figma REST API로 직접 읽어와
// 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것. 실제 API가 아직 없어 데이터는 목업이다.
// 좌표는 모두 프레임(node 187:2673) 원점 기준 상대값이며, 값은 Figma가 반환한 절대좌표에서 프레임 원점을 뺀 것이다.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

const TODAY_LABEL = '8월 6일 목요일';
const GREETING = '좋은 아침이에요';

const CHARACTER_LEVEL = 3;
// 레벨 트랙(w:95.4) 대비 진행 바(w:34) 폭 비율 — Figma 원본 px 값을 그대로 사용.
const LEVEL_TRACK_WIDTH = 95.4;
const LEVEL_FILL_WIDTH = 34;

const SLEEP_TOOLTIP_LINE1 = '깊은 수면이';
const SLEEP_TOOLTIP_LINE2 = '32분 부족했어요';

const SKIN_FORECAST = [
  { key: 'oil', label: '유분', value: 78, status: '과다', statusColor: Colors.warning },
  { key: 'darkCircle', label: '다크서클', value: 41, status: '위험', statusColor: Colors.danger },
  { key: 'dullness', label: '칙칙함', value: 55, status: '보통', statusColor: Colors.success },
] as const;

const FORECAST_TITLE = '오늘의 피부 예보';
const FORECAST_DISCLAIMER = '예보는 확정이 아닌 위험 지수입니다. 식단·날씨·스킨케어도 함께 작용해요.';

const VERIFY_BUTTON_LABEL = '5초 셀피로 오늘 예보 검증하기';
const VERIFICATION_SUMMARY = '어제 예보 적중률 84% · 8일 연속 검증 중';

function ForecastGaugeRow({
  label,
  value,
  status,
  statusColor,
}: {
  label: string;
  value: number;
  status: string;
  statusColor: string;
}) {
  return (
    <View style={styles.gaugeRow}>
      <ThemedText style={styles.gaugeLabel}>{label}</ThemedText>
      <View style={styles.gaugeTrack}>
        <View style={[styles.gaugeFill, { width: `${value}%` }]} />
      </View>
      <ThemedText style={styles.gaugeValue}>
        {value} · <ThemedText style={[styles.gaugeStatus, { color: statusColor }]}>{status}</ThemedText>
      </ThemedText>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [selfieFlowVisible, setSelfieFlowVisible] = useState(false);

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.canvas, { marginTop: insets.top }]}>
          {/* 배경 (fill #DFEAFF) */}
          <View style={StyleSheet.absoluteFill} />

          {/* 상단 안내 문구 (날짜 + 인사말) */}
          <View style={styles.dateGreetingBlock}>
            <ThemedText style={styles.dateText}>{TODAY_LABEL}</ThemedText>
            <View style={styles.greetingRow}>
              <Image source={require('@/assets/images/figma-icon-sun.png')} style={styles.sunIcon} contentFit="contain" />
              <ThemedText style={styles.greetingText}>{GREETING}</ThemedText>
            </View>
          </View>
          <Pressable onPress={() => router.push('/report')} hitSlop={10} style={styles.shareIconWrap}>
            <Image source={require('@/assets/images/figma-icon-share.png')} style={styles.shareIcon} contentFit="contain" />
          </Pressable>

          {/* 캐릭터 레벨 */}
          <ThemedText style={styles.levelText}>LEVEL. {CHARACTER_LEVEL}</ThemedText>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${(LEVEL_FILL_WIDTH / LEVEL_TRACK_WIDTH) * 100}%` }]} />
          </View>

          {/* 캐릭터 */}
          <Image
            source={require('@/assets/images/figma-character.png')}
            style={styles.characterImage}
            contentFit="contain"
          />

          {/* 수면 요약 툴팁 카드 */}
          <Pressable onPress={() => setSleepModalVisible(true)} style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient
              style={styles.tooltipCard}
              colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.22)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}>
              <View style={styles.tooltipIconSlot} />
              <View>
                <ThemedText style={styles.tooltipText}>{SLEEP_TOOLTIP_LINE1}</ThemedText>
                <ThemedText style={styles.tooltipText}>{SLEEP_TOOLTIP_LINE2}</ThemedText>
              </View>
            </LinearGradient>
          </Pressable>
          <Image source={require('@/assets/images/figma-icon-bed.png')} style={styles.tooltipIcon} contentFit="contain" />

          {/* 오늘의 피부 예보 카드 */}
          <View style={styles.forecastCard}>
            <View style={styles.forecastTitleRow}>
              <Image
                source={require('@/assets/images/figma-icon-barchart.png')}
                style={styles.forecastTitleIcon}
                contentFit="contain"
              />
              <ThemedText style={styles.forecastTitle}>{FORECAST_TITLE}</ThemedText>
            </View>
            <View style={styles.gaugeList}>
              {SKIN_FORECAST.map((item) => (
                <ForecastGaugeRow
                  key={item.key}
                  label={item.label}
                  value={item.value}
                  status={item.status}
                  statusColor={item.statusColor}
                />
              ))}
            </View>
            <ThemedText style={styles.forecastDisclaimer}>{FORECAST_DISCLAIMER}</ThemedText>
          </View>

          {/* 검증 버튼 + 트리거 */}
          <Pressable onPress={() => setSelfieFlowVisible(true)} style={({ pressed }) => [styles.verifyButton, pressed && styles.pressed]}>
            <ThemedText style={styles.verifyButtonText}>{VERIFY_BUTTON_LABEL}</ThemedText>
          </Pressable>

          <Pressable
            onPress={() => setSleepModalVisible(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.verificationTrigger, pressed && styles.pressed]}>
            <ThemedText style={styles.verificationSummary}>{VERIFICATION_SUMMARY}</ThemedText>
          </Pressable>
          <Image
            source={require('@/assets/images/figma-icon-chevron-up.png')}
            style={styles.chevronIcon}
            contentFit="contain"
          />

          <View style={styles.divider} />
        </View>
      </View>

      <SleepDetailModal visible={sleepModalVisible} onClose={() => setSleepModalVisible(false)} />
      <SelfieVerificationFlow
        visible={selfieFlowVisible}
        onClose={() => setSelfieFlowVisible(false)}
        onFinish={() => setSelfieFlowVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.bgSoftBlue,
  },
  // 프레임(node 187:2673): 402x874, fill #DFEAFF
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: Colors.bgSoftBlue,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },

  // "8월 6일 목요일 좋은 아침이에요" (node 187:2710, x:31 y:55 w:195 h:68) — 혼합 스타일 텍스트 런
  dateGreetingBlock: {
    position: 'absolute',
    left: 31,
    top: 55,
  },
  dateText: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '400',
    color: '#646464',
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  sunIcon: {
    width: 24,
    height: 24,
  },
  greetingText: {
    marginLeft: 8,
    fontSize: 25,
    lineHeight: 35,
    fontWeight: '700',
    color: '#000000',
  },
  // Vector (node 187:2707, x:359 y:101 w:19 h:19)
  shareIconWrap: {
    position: 'absolute',
    left: 359,
    top: 101,
  },
  shareIcon: {
    width: 19,
    height: 19,
  },

  // "LEVEL. 3" (node 187:2703, x:37 y:134 w:103.35 h:17.06)
  levelText: {
    position: 'absolute',
    left: 37,
    top: 134,
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  // 레벨 트랙 배경 value (node 187:2704, x:107.17 y:140.02 w:95.4 h:6.98, radius:5.82)
  levelTrack: {
    position: 'absolute',
    left: 107,
    top: 140,
    width: LEVEL_TRACK_WIDTH,
    height: 7,
    borderRadius: 6,
    backgroundColor: Colors.mutedGray,
    overflow: 'hidden',
  },
  // 레벨 트랙 채움 value (node 187:2705, x:107 y:140 w:34 h:7, radius:5.82)
  levelFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: Colors.primaryDark,
  },

  // ghost3-nobg-shadow (1) 1 (node 187:2678, x:-17 y:162 w:367 h:296)
  characterImage: {
    position: 'absolute',
    left: -17,
    top: 162,
    width: 367,
    height: 296,
  },

  // "div" 수면 요약 툴팁 카드 (node 187:2679, x:181 y:158 w:199 h:78, radius:25.3)
  tooltipCard: {
    position: 'absolute',
    left: 181,
    top: 158,
    width: 199,
    height: 78,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 21,
    gap: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    shadowColor: '#5A6EA0',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 4,
  },
  // "span" 아이콘 슬롯 (node 187:2680, w:19 h:24) — 실제 아이콘은 Person In Bed 레이어로 위에 겹쳐 그린다.
  tooltipIconSlot: {
    width: 19,
    height: 24,
  },
  tooltipText: {
    fontSize: 16,
    lineHeight: 27,
    fontWeight: '700',
    color: '#1C2430',
  },
  // Person In Bed (node 187:2702, x:198 y:186 w:27 h:27) — 프레임 루트의 독립 레이어(플로팅)
  tooltipIcon: {
    position: 'absolute',
    left: 198,
    top: 186,
    width: 27,
    height: 27,
  },

  // "오늘의 피부 예보" 카드 (node 187:2683, x:22 y:481 w:358 h:185.77, radius:16.6)
  forecastCard: {
    position: 'absolute',
    left: 22,
    top: 481,
    width: 358,
    height: 186,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderWidth: 1,
    borderColor: '#DCDCDC',
    padding: 19,
    gap: 12,
  },
  forecastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  forecastTitleIcon: {
    width: 22,
    height: 22,
  },
  forecastTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  gaugeList: {
    gap: 12,
  },
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeLabel: {
    width: 58,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#6B6B6B',
  },
  gaugeTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(181, 194, 207, 0.75)',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.primaryDark,
  },
  gaugeValue: {
    width: 86,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  gaugeStatus: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  forecastDisclaimer: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    color: '#9E9E9E',
  },

  // Button 인스턴스 (node 187:2675, x:29 y:686 w:345 h:52, radius:10)
  verifyButton: {
    position: 'absolute',
    left: 29,
    top: 686,
    width: 345,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDark,
  },
  verifyButtonText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.white,
  },

  // "어제 예보 적중률..." (node 187:2677, x:30 y:750 w:345 h:17)
  verificationTrigger: {
    position: 'absolute',
    left: 30,
    top: 750,
    width: 345,
    alignItems: 'center',
  },
  verificationSummary: {
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '400',
    color: '#9E9E9E',
    textAlign: 'center',
  },
  // Vector 쉐브론 (node 187:2706, x:190 y:774 w:23 h:13)
  chevronIcon: {
    position: 'absolute',
    left: 190,
    top: 774,
    width: 23,
    height: 13,
  },

  // Line 1 (node 187:2674, x:-12 y:800 w:440 h:0, stroke #C7C7C7)
  divider: {
    position: 'absolute',
    left: -12,
    top: 800,
    width: 440,
    height: 1,
    backgroundColor: '#C7C7C7',
  },
});
