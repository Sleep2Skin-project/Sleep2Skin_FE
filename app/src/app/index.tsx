import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelfieVerificationFlow } from '@/components/selfie-verification-flow';
import { SleepDetailModal } from '@/components/sleep-detail-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// HOME (HOME-01~11) — docs/home.png 와이어프레임을 그대로 따른다.
// 실제 API·에셋이 아직 없어 아래 값은 전부 목업이며, 캐릭터는 회색 Placeholder로 대체한다.
const SLEEP_SUMMARY = {
  headline: '깊은 수면이 32분 부족했어요',
  badges: [
    { label: '깊은수면', value: '42분' },
    { label: '각성', value: '2회' },
    { label: '취침', value: '02:10' },
  ],
} as const;

const CHARACTER = {
  level: 3,
  progress: 0.45,
} as const;

const SKIN_FORECAST = [
  { key: 'oil', label: '유분', value: 62, color: '#F5A623' },
  { key: 'darkCircle', label: '다크서클', value: 58, color: '#5E5CE6' },
  { key: 'dullness', label: '칙칙함', value: 45, color: '#8E8E93' },
  { key: 'redness', label: '붉은기', value: 30, color: '#FF3B30' },
] as const;

const FORECAST_DISCLAIMER =
  '예보는 확정이 아닌 위험 지수입니다. 실제 피부 상태는 셀피 검증으로 확인해 주세요.';

const VERIFICATION_SUMMARY = '예보 적중률 82% · 연속 검증 5일째';

// 수면 요약 카드는 '어젯밤'을 상징하는 밤하늘 배경으로 고정한다 (라이트/다크 모드 무관).
const NIGHT_SKY_STARS = [
  { top: '14%', left: '12%', size: 3, opacity: 0.9 },
  { top: '22%', left: '78%', size: 2, opacity: 0.6 },
  { top: '58%', left: '18%', size: 2, opacity: 0.5 },
  { top: '16%', left: '48%', size: 2, opacity: 0.75 },
  { top: '68%', left: '70%', size: 3, opacity: 0.7 },
  { top: '78%', left: '32%', size: 2, opacity: 0.5 },
  { top: '40%', left: '60%', size: 2, opacity: 0.85 },
  { top: '52%', left: '42%', size: 2, opacity: 0.4 },
  { top: '32%', left: '30%', size: 2, opacity: 0.6 },
  { top: '82%', left: '55%', size: 2, opacity: 0.55 },
] as const;

function NightSkyBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.nightGlow} />
      {NIGHT_SKY_STARS.map((star, index) => (
        <View
          key={index}
          style={[
            styles.star,
            {
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              opacity: star.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

function SleepSummaryCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={styles.summaryCard}>
        <NightSkyBackground />
        <View style={styles.summaryHeaderRow}>
          <ThemedText style={styles.summaryHeadline}>{SLEEP_SUMMARY.headline}</ThemedText>
          <ThemedText style={styles.summaryMoonIcon}>🌙</ThemedText>
        </View>
        <View style={styles.badgeRow}>
          {SLEEP_SUMMARY.badges.map((badge) => (
            <View key={badge.label} style={styles.badge}>
              <ThemedText style={styles.badgeText}>
                {badge.label} {badge.value}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

function CharacterSection() {
  const theme = useTheme();

  return (
    <ThemedView type="backgroundElement" style={styles.characterCard}>
      <View style={styles.levelRow}>
        <ThemedText type="smallBold">Level. {CHARACTER.level}</ThemedText>
        <View style={[styles.levelTrack, { backgroundColor: theme.backgroundSelected }]}>
          <View
            style={[
              styles.levelFill,
              { width: `${CHARACTER.progress * 100}%`, backgroundColor: theme.text },
            ]}
          />
        </View>
      </View>

      {/* 캐릭터 에셋 미정 — 준비 중 문구가 담긴 회색 Placeholder로 대체한다. */}
      <View style={[styles.characterPlaceholder, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="small" themeColor="textSecondary">
          본인 캐릭터 (준비 중)
        </ThemedText>
      </View>
    </ThemedView>
  );
}

function ForecastGaugeRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.gaugeRow}>
      <ThemedText style={styles.gaugeLabel}>{label}</ThemedText>
      <View style={[styles.gaugeTrack, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.gaugeFill, { width: `${value}%`, backgroundColor: color }]} />
        {/* 조정 불가한 시각용 핸들 — 채워진 구간의 시작(0%)과 끝(value%)을 동그라미로 강조한다. */}
        <View style={[styles.gaugeHandle, { left: 0, backgroundColor: color }]} />
        <View style={[styles.gaugeHandle, { left: `${value}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.gaugeScaleRow}>
        <ThemedText style={styles.gaugeScaleText} themeColor="textSecondary">
          0%
        </ThemedText>
        <ThemedText style={styles.gaugeScaleText} themeColor="textSecondary">
          {value}%
        </ThemedText>
      </View>
    </View>
  );
}

function SkinForecastSection() {
  return (
    <View style={styles.forecastSection}>
      <ThemedText style={styles.forecastTitle}>오늘의 피부 예보</ThemedText>
      <View style={styles.gaugeList}>
        {SKIN_FORECAST.map((item) => (
          <ForecastGaugeRow key={item.key} label={item.label} value={item.value} color={item.color} />
        ))}
      </View>
      <ThemedText style={styles.forecastDisclaimer} themeColor="textSecondary">
        {FORECAST_DISCLAIMER}
      </ThemedText>
    </View>
  );
}

function ActionSection({
  onOpenSleepDetail,
  onOpenSelfieVerification,
}: {
  onOpenSleepDetail: () => void;
  onOpenSelfieVerification: () => void;
}) {
  return (
    <View style={styles.actionSection}>
      <Pressable onPress={onOpenSelfieVerification} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="text" style={styles.verifyButton}>
          <ThemedText themeColor="background" style={styles.verifyButtonText}>
            5초 셀피로 오늘 예보 검증하기
          </ThemedText>
        </ThemedView>
      </Pressable>

      <Pressable
        onPress={onOpenSleepDetail}
        hitSlop={12}
        style={({ pressed }) => [styles.verificationTrigger, pressed && styles.pressed]}>
        <ThemedText type="small" themeColor="textSecondary">
          {VERIFICATION_SUMMARY}
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.chevronUp}>
          ⌃
        </ThemedText>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const [sleepModalVisible, setSleepModalVisible] = useState(false);
  const [selfieFlowVisible, setSelfieFlowVisible] = useState(false);

  const contentPlatformStyle = {
    paddingTop: safeAreaInsets.top + Spacing.three,
    paddingBottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  return (
    <>
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <SleepSummaryCard onPress={() => router.push('/report')} />
          <CharacterSection />
          <SkinForecastSection />
          <ActionSection
            onOpenSleepDetail={() => setSleepModalVisible(true)}
            onOpenSelfieVerification={() => setSelfieFlowVisible(true)}
          />
        </View>
      </ScrollView>

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
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
  },
  container: {
    width: '100%',
    maxWidth: MaxContentWidth,
    // 화면 높이만큼 채우고, 캐릭터 카드(flex: 1)가 남는 세로 공간을 흡수해
    // 아래 예보·버튼 영역을 화면 하단까지 밀어낸다.
    flexGrow: 1,
    gap: 22,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  summaryCard: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    marginHorizontal: Spacing.half,
    backgroundColor: '#10163A',
    overflow: 'hidden',
  },
  nightGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(120, 144, 220, 0.28)',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  summaryHeadline: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryMoonIcon: {
    fontSize: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  badge: {
    paddingVertical: Spacing.half,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.four,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  characterCard: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
  },
  levelTrack: {
    width: 80,
    height: 5,
    borderRadius: Spacing.half,
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: Spacing.half,
  },
  characterPlaceholder: {
    flex: 1,
    minHeight: 240,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forecastSection: {
    gap: Spacing.two,
  },
  forecastTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  gaugeList: {
    gap: Spacing.two,
  },
  gaugeRow: {
    gap: Spacing.half,
  },
  gaugeLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  gaugeTrack: {
    height: 6,
    borderRadius: 3,
  },
  gaugeFill: {
    height: '100%',
    borderRadius: 3,
  },
  gaugeHandle: {
    position: 'absolute',
    top: '50%',
    width: 12,
    height: 12,
    marginTop: -6,
    marginLeft: -6,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  gaugeScaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gaugeScaleText: {
    fontSize: 10,
    lineHeight: 13,
  },
  forecastDisclaimer: {
    fontSize: 11,
    lineHeight: 15,
  },
  actionSection: {
    gap: Spacing.half,
    paddingBottom: Spacing.four,
  },
  verifyButton: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 351,
    height: 53,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  verificationTrigger: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  chevronUp: {
    fontSize: 34,
    lineHeight: 34,
    fontWeight: '600',
  },
});
