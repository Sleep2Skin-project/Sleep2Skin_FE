import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSkinForecast } from '@/api/skin';
import { getSleepInterpretation, uploadSleepSession, type UploadSleepSessionRequest } from '@/api/sleep';
import { completeUserOnboarding, saveUserConsent } from '@/api/user';
import { SelfieVerificationFlow } from '@/components/selfie-verification-flow';
import { SleepDetailModal } from '@/components/sleep-detail-modal';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/colors';
import { HOME_SUMMARY_MOCK, type SkinRiskLevel } from '@/constants/mockData';

// TODO: 통신 테스트용 더미 데이터. 실제 수면 세션 업로드 플로우가 붙으면 제거한다.
const DUMMY_SLEEP_SESSION: UploadSleepSessionRequest = {
  segments: [
    { stage: 'AWAKE', startTime: '2026-08-06T23:35:00+09:00', endTime: '2026-08-06T23:40:00+09:00' },
    { stage: 'UNSPECIFIED', startTime: '2026-08-06T23:40:00+09:00', endTime: '2026-08-07T00:55:00+09:00' },
    { stage: 'DEEP', startTime: '2026-08-07T00:55:00+09:00', endTime: '2026-08-07T01:32:00+09:00' },
  ],
  hrv: 41.2,
  restingHeartRate: 63,
};

// HOME — Figma 'Ui' 파일 노드 187:2673("홈 화면")을 Figma REST API로 직접 읽어와
// 402x874 고정 해상도로 좌표/스타일을 그대로 옮긴 것. 실제 API가 아직 없어 데이터는
// src/constants/mockData.ts의 HOME_SUMMARY_MOCK을 사용한다.
// 좌표는 모두 프레임(node 187:2673) 원점 기준 상대값이며, 값은 Figma가 반환한 절대좌표에서 프레임 원점을 뺀 것이다.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;

// 레벨 트랙 폭(w:95.4) — Figma 원본 px 값을 그대로 사용. 채움 폭은 mock의 progressPercent로 계산한다.
const LEVEL_TRACK_WIDTH = 95.4;

const RISK_LEVEL_COLOR: Record<SkinRiskLevel, string> = {
  danger: Colors.danger,
  warning: Colors.warning,
  success: Colors.success,
};

const VERIFY_BUTTON_LABEL = '5초 셀피로 오늘 예보 검증하기';

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

  useEffect(() => {
    uploadSleepSession(DUMMY_SLEEP_SESSION, 1)
      .then(({ data }) => {
        const barrierScore = data.forecast.barrier?.score ?? '산출 불가';
        console.log(`✅ 수면 데이터 업로드 성공! 오늘의 장벽 점수: ${barrierScore}`);
      })
      .catch((error) => {
        console.error('❌ 수면 데이터 업로드 실패:', error.message);
      });
  }, []);

  useEffect(() => {
    getSkinForecast('2026-08-09', 1)
      .then(({ data }) => {
        if (data.status === 'AVAILABLE') {
          console.log(`✅ 피부 예보 조회 성공: ${data.forecast.darkCircle.score}`);
        } else {
          console.log(`✅ 수면 데이터 없음: ${data.message}`);
        }
      })
      .catch((error) => {
        console.error('❌ 피부 예보 조회 실패:', error.message);
      });
  }, []);

  useEffect(() => {
    getSleepInterpretation('2026-08-09', 1)
      .then(({ data }) => {
        if (data.status === 'AVAILABLE') {
          console.log(`✅ 수면 통역 조회 성공: ${data.interpretation.headline}`);
        } else {
          console.log(`✅ 수면 통역 없음: ${data.message}`);
        }
      })
      .catch((error) => {
        console.error('❌ 수면 통역 조회 실패:', error.message);
      });
  }, []);

  useEffect(() => {
    saveUserConsent(1)
      .then(({ data }) => {
        console.log(`✅ 약관 동의 성공: 버전 ${data.termsVersion} (신규동의 여부: ${data.newlyAgreed})`);
      })
      .catch((error) => {
        console.error('❌ 약관 동의 실패:', error.message);
      });
  }, []);

  useEffect(() => {
    completeUserOnboarding(1)
      .then(({ data }) => {
        console.log(
          `✅ 온보딩 완료 처리 성공: 완료 상태 ${data.onboardingCompleted} (신규처리 여부: ${data.newlyCompleted})`
        );
      })
      .catch((error) => {
        console.error('❌ 온보딩 완료 처리 실패:', error.message);
      });
  }, []);

  return (
    <>
      <View style={styles.screen}>
        <View style={[styles.canvas, { marginTop: insets.top }]}>
          {/* 배경 (fill #DFEAFF) */}
          <View style={StyleSheet.absoluteFill} />

          {/* 상단 안내 문구 (날짜 + 인사말) */}
          <View style={styles.dateGreetingBlock}>
            <ThemedText style={styles.dateText}>{HOME_SUMMARY_MOCK.date.label}</ThemedText>
            <View style={styles.greetingRow}>
              <Image source={require('@/assets/images/figma-icon-sun.png')} style={styles.sunIcon} contentFit="contain" />
              <ThemedText style={styles.greetingText}>{HOME_SUMMARY_MOCK.greeting.message}</ThemedText>
            </View>
          </View>
          <Pressable onPress={() => router.push('/report')} hitSlop={10} style={styles.shareIconWrap}>
            <Image source={require('@/assets/images/figma-icon-share.png')} style={styles.shareIcon} contentFit="contain" />
          </Pressable>

          {/* 캐릭터 레벨 */}
          <ThemedText style={styles.levelText}>LEVEL. {HOME_SUMMARY_MOCK.level.current}</ThemedText>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${HOME_SUMMARY_MOCK.level.progressPercent}%` }]} />
          </View>

          {/* 캐릭터 */}
          <Image
            source={require('@/assets/images/figma-character.png')}
            style={styles.characterImage}
            contentFit="contain"
          />

          {/* 수면 요약 툴팁 카드 */}
          <Pressable onPress={() => router.push('/report')} style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient
              style={styles.tooltipCard}
              colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.22)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}>
              <View style={styles.tooltipIconSlot} />
              <View>
                {HOME_SUMMARY_MOCK.sleepSummary.tooltipLines.map((line, index) => (
                  <ThemedText key={index} style={styles.tooltipText}>
                    {line}
                  </ThemedText>
                ))}
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
              <ThemedText style={styles.forecastTitle}>{HOME_SUMMARY_MOCK.skinForecast.title}</ThemedText>
            </View>
            <View style={styles.gaugeList}>
              {HOME_SUMMARY_MOCK.skinForecast.items.map((item) => (
                <ForecastGaugeRow
                  key={item.key}
                  label={item.label}
                  value={item.value}
                  status={item.status}
                  statusColor={RISK_LEVEL_COLOR[item.riskLevel]}
                />
              ))}
            </View>
            <ThemedText style={styles.forecastDisclaimer}>{HOME_SUMMARY_MOCK.skinForecast.disclaimer}</ThemedText>
          </View>

          {/* 검증 버튼 + 트리거 */}
          <Pressable onPress={() => setSelfieFlowVisible(true)} style={({ pressed }) => [styles.verifyButton, pressed && styles.pressed]}>
            <ThemedText style={styles.verifyButtonText}>{VERIFY_BUTTON_LABEL}</ThemedText>
          </Pressable>

          <View style={styles.verificationTrigger}>
            <ThemedText style={styles.verificationSummary}>{HOME_SUMMARY_MOCK.verification.summaryText}</ThemedText>
          </View>
          <Pressable
            onPress={() => setSleepModalVisible(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.chevronIcon, pressed && styles.pressed]}>
            <Image
              source={require('@/assets/images/figma-icon-chevron-up.png')}
              style={styles.chevronImage}
              contentFit="contain"
            />
          </Pressable>

          <View style={styles.divider} />
        </View>
      </View>

      <SleepDetailModal visible={sleepModalVisible} onClose={() => setSleepModalVisible(false)} />
      <SelfieVerificationFlow
        visible={selfieFlowVisible}
        onClose={() => setSelfieFlowVisible(false)}
        onFinish={() => {
          setSelfieFlowVisible(false);
          router.push('/todo');
        }}
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
  chevronImage: {
    width: '100%',
    height: '100%',
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
