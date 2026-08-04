import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ONB-01~05 온보딩 (공통) 흐름 — docs/onboarding.png 와이어프레임 4장을 그대로 따른다.
// 탭 밖 진입 플로우이므로 이 컴포넌트는 src/app/_layout.tsx에서 AppTabs 대신 렌더된다.
const STEP_COUNT = 3;

type HealthKitStatus = 'idle' | 'connected' | 'skipped';

const SLEEP_METRICS = [
  {
    label: '깊은 수면·REM·코어',
    hint: '장벽 재생/콜라겐 지표',
    icon: '🌙',
    iconColor: '#5E5CE6',
  },
  {
    label: '취침·기상 시각',
    hint: '수면 규칙성',
    icon: '🛏️',
    iconColor: '#0A84FF',
  },
  {
    label: '야간 각성 횟수',
    hint: '다크서클 예측 핵심 변수',
    icon: '👁️',
    iconColor: '#FF9F0A',
  },
  {
    label: 'HRV/안정시 심박',
    hint: '스트레스성 트러블 신호',
    icon: '❤️',
    iconColor: '#FF2D55',
  },
] as const;

const PRIVACY_POINTS = ['원본 이미지 즉시 폐기', '숫자 지표만 저장', '언제든 전체 삭제'] as const;

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: total }).map((_, index) => (
        <ThemedView
          key={index}
          type={index <= current ? 'text' : 'backgroundElement'}
          style={styles.progressSegment}
        />
      ))}
    </View>
  );
}

function OnboardingHeader({ step, onBack }: { step: number; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        disabled={!onBack}
        hitSlop={12}
        style={({ pressed }) => [styles.backButton, pressed && onBack && styles.pressed]}>
        {onBack && <ThemedText style={styles.backChevron}>‹</ThemedText>}
      </Pressable>
      <ProgressBar current={step} total={STEP_COUNT} />
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  fullWidth = true,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => pressed && !disabled && styles.pressed}>
      <ThemedView
        type="text"
        style={[
          styles.primaryButton,
          !fullWidth && styles.primaryButtonCompact,
          disabled && styles.buttonDisabled,
        ]}>
        <ThemedText themeColor="background" style={styles.primaryButtonText}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

// 와이어프레임 01: 일러스트 에셋이 아직 미정이라(docs 명세 참고) 실제 그림 대신
// 자리만 잡아두는 빈 플레이스홀더를 그대로 재현한다. 임의의 카피를 채워 넣지 않는다.
function IllustrationPlaceholder() {
  return <ThemedView type="backgroundElement" style={styles.illustrationPlaceholder} />;
}

function WatchIcon() {
  const theme = useTheme();
  return (
    <View style={[styles.watchFace, { borderColor: theme.text }]}>
      <View style={[styles.watchCrown, { backgroundColor: theme.text }]} />
    </View>
  );
}

function LockIcon() {
  const theme = useTheme();
  return (
    <View style={styles.lockIcon}>
      <View style={[styles.lockShackle, { borderColor: theme.text }]} />
      <View style={[styles.lockBody, { backgroundColor: theme.text }]} />
    </View>
  );
}

// ONB-01: 앱 최초 실행 시 서비스 가치를 전달한다.
function ValueStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.stepBody}>
      <View>
        <ThemedText type="title">
          당신의{'\n'}피부 예보
        </ThemedText>
        <IllustrationPlaceholder />
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="시작하기" onPress={onNext} />
        {/* TODO: 기존 계정 로그인 플로우가 생기면 아래 텍스트에 연결한다. */}
        <ThemedText type="link" themeColor="textSecondary" style={styles.centerText}>
          이미 계정이 있어요
        </ThemedText>
      </View>
    </View>
  );
}

// ONB-03: HealthKit 수면 데이터 읽기 권한을 요청한다.
function SleepStep({
  status,
  onOpenHealthAccess,
  onBack,
}: {
  status: HealthKitStatus;
  onOpenHealthAccess: () => void;
  onBack: () => void;
}) {
  const connectLabel = status === 'connected' ? '연결됨' : '연동하기';

  return (
    <View style={styles.stepBody}>
      <View style={styles.contentCenter}>
        <View style={styles.heroBlock}>
          <WatchIcon />
          <ThemedText type="subtitle" style={styles.centerText}>
            수면 데이터를{'\n'}연결해주세요.
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Apple Health 데이터를 연동해요
          </ThemedText>
        </View>

        <View style={styles.featureList}>
          {SLEEP_METRICS.map((metric) => (
            <ThemedView key={metric.label} type="backgroundElement" style={styles.featureRow}>
              <ThemedView type="text" style={styles.featureBullet} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                {metric.label}
                {'('}
                {metric.hint}
                {')'}
              </ThemedText>
            </ThemedView>
          ))}
        </View>
      </View>

      <View style={styles.sleepFooterRow}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedText type="link" themeColor="textSecondary">
            이전
          </ThemedText>
        </Pressable>
        <PrimaryButton
          label={connectLabel}
          onPress={onOpenHealthAccess}
          disabled={status === 'connected'}
          fullWidth={false}
        />
      </View>
    </View>
  );
}

// ONB-04: 셀피 원본 미저장 정책을 3항목으로 고지한다.
function PrivacyStep({ onFinish }: { onFinish: () => void }) {
  return (
    <View style={styles.stepBody}>
      <View>
        <View style={styles.heroBlock}>
          <LockIcon />
          <ThemedText type="subtitle" style={styles.centerText}>
            셀피는 저장하지 않습니다
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            촬영한 셀피는 가장 민감한 데이터예요.{'\n'}SkinCast는 필요한 최소한만 다뤄요.
          </ThemedText>
        </View>

        <View style={styles.privacyList}>
          {PRIVACY_POINTS.map((label) => (
            <ThemedView key={label} type="backgroundElement" style={styles.privacyRow}>
              <ThemedView type="text" style={styles.featureBullet} />
              <ThemedText type="smallBold">{label}</ThemedText>
            </ThemedView>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="시작하기" onPress={onFinish} />
      </View>
    </View>
  );
}

// 와이어프레임 3번째 이미지: '연동하기'를 누르면 뜨는 iOS 건강 접근 권한 시트를 본뜬 커스텀 모달.
function HealthAccessModal({
  visible,
  onAllow,
  onDeny,
}: {
  visible: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const theme = useTheme();
  const [toggles, setToggles] = useState<boolean[]>(() => SLEEP_METRICS.map(() => true));
  const allOn = toggles.every(Boolean);
  const anyOn = toggles.some(Boolean);

  const setAll = (value: boolean) => setToggles(SLEEP_METRICS.map(() => value));
  const toggleAt = (index: number) =>
    setToggles((prev) => prev.map((value, i) => (i === index ? !value : value)));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDeny}>
      <View style={styles.modalBackdrop}>
        <ThemedView style={styles.modalSheet}>
          <View style={[styles.modalGrabber, { backgroundColor: theme.backgroundSelected }]} />

          <View style={[styles.modalNavBar, { borderBottomColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">건강 접근</ThemedText>
          </View>

          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeartCircle}>
              <ThemedText style={styles.modalHeartIcon}>♥</ThemedText>
            </View>

            <ThemedText type="subtitle" style={styles.centerText}>
              건강
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
              &apos;SkinCast&apos;이 사용자의 건강 데이터에 접근하여 업데이트하려고 합니다.
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.modalSection}>
              <Pressable
                onPress={() => setAll(!allOn)}
                style={({ pressed }) => [styles.modalSectionRow, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.modalAllOnLabel}>
                  모두 켜기
                </ThemedText>
                <Switch
                  value={allOn}
                  onValueChange={setAll}
                  trackColor={{ true: '#34C759', false: theme.backgroundSelected }}
                />
              </Pressable>
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary" style={styles.modalSectionLabel}>
              &apos;SkinCast&apos;의 읽기 항목
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.modalSection}>
              {SLEEP_METRICS.map((metric, index) => (
                <View key={metric.label}>
                  <View style={styles.modalSectionRow}>
                    <View style={[styles.modalIconBadge, { backgroundColor: metric.iconColor }]}>
                      <ThemedText style={styles.modalIconGlyph}>{metric.icon}</ThemedText>
                    </View>
                    <ThemedText type="small" style={styles.modalRowLabel}>
                      {metric.label}
                    </ThemedText>
                    <Switch
                      value={toggles[index]}
                      onValueChange={() => toggleAt(index)}
                      trackColor={{ true: '#34C759', false: theme.backgroundSelected }}
                    />
                  </View>
                  {index < SLEEP_METRICS.length - 1 && (
                    <View
                      style={[styles.modalRowDivider, { backgroundColor: theme.backgroundSelected }]}
                    />
                  )}
                </View>
              ))}
            </ThemedView>
          </ScrollView>

          <View style={styles.modalActions}>
            <PrimaryButton label="적용" onPress={onAllow} disabled={!anyOn} />
            <Pressable
              onPress={onDeny}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="link" themeColor="textSecondary" style={styles.centerText}>
                적용 안 함
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [healthStatus, setHealthStatus] = useState<HealthKitStatus>('idle');
  const [healthModalVisible, setHealthModalVisible] = useState(false);

  const handleAllowHealthAccess = () => {
    // TODO(ONB-03): 실제 HealthKit 읽기 권한 요청(react-native-health 등)으로 교체한다.
    setHealthStatus('connected');
    setHealthModalVisible(false);
    setStep(2);
  };

  const handleDenyHealthAccess = () => {
    // 연결(yes)·미연결(no) 모두 다음 단계로 수렴한다 (docs ONB-03 비고).
    setHealthStatus('skipped');
    setHealthModalVisible(false);
    setStep(2);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.safeArea}>
        <OnboardingHeader step={step} onBack={step > 0 ? () => setStep((s) => s - 1) : undefined} />

        {step === 0 && <ValueStep onNext={() => setStep(1)} />}
        {step === 1 && (
          <SleepStep
            status={healthStatus}
            onOpenHealthAccess={() => setHealthModalVisible(true)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && <PrivacyStep onFinish={onComplete} />}
      </View>

      <HealthAccessModal
        visible={healthModalVisible}
        onAllow={handleAllowHealthAccess}
        onDeny={handleDenyHealthAccess}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.six,
    paddingBottom: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  backButton: {
    width: Spacing.four,
    height: Spacing.four,
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 26,
    lineHeight: 26,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: Spacing.half,
  },
  stepBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  heroBlock: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  contentCenter: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  illustrationPlaceholder: {
    width: '100%',
    height: 56,
    marginTop: Spacing.three,
    borderRadius: Spacing.two,
  },
  footer: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  primaryButton: {
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  primaryButtonCompact: {
    paddingHorizontal: Spacing.five,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  watchFace: {
    width: 44,
    height: 52,
    borderWidth: 2.5,
    borderRadius: 14,
  },
  watchCrown: {
    position: 'absolute',
    right: -6,
    top: '38%',
    width: 6,
    height: 12,
    borderRadius: 2,
  },
  featureList: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  featureRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  featureBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sleepFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
  },
  lockIcon: {
    alignItems: 'center',
  },
  lockShackle: {
    width: 14,
    height: 12,
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginBottom: -2,
  },
  lockBody: {
    width: 22,
    height: 16,
    borderRadius: 4,
  },
  privacyList: {
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  privacyRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    overflow: 'hidden',
  },
  modalGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: Spacing.half,
    marginTop: Spacing.two,
  },
  modalNavBar: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalHeartCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  modalHeartIcon: {
    color: '#ffffff',
    fontSize: 26,
  },
  modalSection: {
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
    overflow: 'hidden',
  },
  modalSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  modalAllOnLabel: {
    flex: 1,
    color: '#3C87F7',
  },
  modalSectionLabel: {
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.one,
    textTransform: 'uppercase',
  },
  modalIconBadge: {
    width: 28,
    height: 28,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIconGlyph: {
    fontSize: 14,
  },
  modalRowLabel: {
    flex: 1,
  },
  modalRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 28 + Spacing.three,
  },
  modalActions: {
    gap: Spacing.two,
    padding: Spacing.four,
    paddingTop: Spacing.two,
  },
});
