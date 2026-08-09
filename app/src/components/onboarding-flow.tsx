import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ONB-01~05 온보딩(공통) 흐름 — 탭 밖 진입 플로우이므로 이 컴포넌트는 src/app/_layout.tsx에서
// AppTabs 대신 렌더된다.
// 전체 캔버스는 HOME(index.tsx, node 187:2673)과 동일한 402x874 고정 컨테이너 규격을 따른다.
// ONB-01("온보딩 1", node 252:139)·ONB-02("온보딩 2", node 256:573)·ONB-03("온보딩 3", node 260:643)
// 모두 Figma REST API로 좌표·색상·타이포를 그대로 옮겼고, 부모 테마(다크모드)와 무관하게 항상
// Figma 지정 배경(#FFFFFF)으로 렌더한다. 세 화면 모두 본문(제목/리스트/CTA 등)이 프레임의 자식
// 레이어가 아니라 같은 Figma 캔버스 위에 프레임과 겹쳐 배치된 loose 오브젝트라, 프레임 원점을
// 기준으로 좌표를 역산해 옮겼다.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;
const STEP_COUNT = 3;

const SLEEP_TEXT_TITLE = '#050505';
const SLEEP_TEXT_BODY = '#1A2B4C';
const SLEEP_TEXT_MUTED = '#5C6B7A';
const SLEEP_TEXT_BACK_LABEL = '#6B6B6B';

const HEALTH_TEXT_TITLE = '#1A1A1A';
const HEALTH_TEXT_SUBTITLE = '#6B6B6B';
const HEALTH_TEXT_HINT = '#9E9E9E';
const HEALTH_CARD_BG = '#F4F4F4';
const HEALTH_CHECKBOX_BG = '#DEDEDE';

type HealthKitStatus = 'idle' | 'connected' | 'skipped';

// "온보딩 2"(node 256:573) 지표 리스트 문구·순서 그대로. 아이콘은 4항목 모두 동일한 흰 체크
// (componentId 243:638, app/assets/images/figma-icon-onboarding-check.png)라 icon/iconColor는
// HealthAccessModal(Figma 데이터 없는 별도 화면) 표시용으로만 쓰인다.
const SLEEP_METRICS = [
  { label: '야간 각성 횟수', icon: '👁️', iconColor: '#FF9F0A' },
  { label: '깊은 수면·REM·코어', icon: '🌙', iconColor: '#5E5CE6' },
  { label: 'HRV·안정시 심박', icon: '❤️', iconColor: '#FF2D55' },
  { label: '취침·기상 시각(수면 규칙성)', icon: '🛏️', iconColor: '#0A84FF' },
] as const;

// "온보딩 3"(node 260:643) > "읽어올 데이터" 카드(node 261:678) 4개 항목 문구·순서 그대로.
const HEALTH_DATA_ITEMS = [
  { title: '깊은 수면 · REM · 코어', subtitle: '장벽 재생과 콜라겐 합성 지표' },
  { title: '취침 · 기상 시각', subtitle: '수면 규칙성 계산' },
  { title: '야간 각성 횟수', subtitle: '다크서클 예측의 핵심 변수' },
  { title: 'HRV · 안정시 심박', subtitle: '스트레스성 트러블 신호' },
] as const;

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

// ONB-01("온보딩 1", node 252:139): 앱 최초 실행 시 서비스 가치를 전달한다.
// 텍스트/색상/좌표는 모두 Figma 노드 값을 그대로 옮겼고, 부모 테마와 무관하게 항상
// Figma 지정 배경(#FFFFFF)으로 렌더한다(ONB-02/03과 동일 방식).
function ValueStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.figmaCanvas}>
      <FigmaStepHeader onBack={() => {}} filledSegments={1} />

      {/* "당신의 \n피부 예보" (node 255:561, x:26 y:200 w:156 h:81) */}
      <Text style={styles.valueTitle}>{'당신의 \n피부 예보'}</Text>

      {/* 설명 (node 256:562, x:26 y:305 w:360 h:48) */}
      <Text style={styles.valueBody}>
        애플워치가 기록한 어젯밤 수면을 피부 언어로 번역합니다.{'\n'}오늘 당신의 피부가 어떨지, 아침 5초면 알 수 있어요.
      </Text>

      {/* "시작하기" 버튼 (node 256:563, x:25 y:706 w:351 h:53, radius:13) */}
      <Pressable
        onPress={onNext}
        style={({ pressed }) => [styles.valuePrimaryButton, pressed && styles.pressed]}>
        <Text style={styles.valuePrimaryButtonText}>시작하기</Text>
      </Pressable>

      {/* "이미 계정이 있어요" (node 256:565, x:125 y:781 w:157 h:17) */}
      {/* TODO: 기존 계정 로그인 플로우가 생기면 아래 버튼에 연결한다. */}
      <Pressable hitSlop={8} style={({ pressed }) => [styles.valueSecondaryButton, pressed && styles.pressed]}>
        <Text style={styles.valueSecondaryButtonText}>이미 계정이 있어요</Text>
      </Pressable>
    </View>
  );
}

// ── ONB-01/02/03 공용 크롬 — Figma 노드 값을 그대로 옮긴 화면들 전용 ───────────────────
// 부모(캔버스)가 다크모드로 렌더돼 있어도 이 화면들만은 항상 Figma가 지정한 흰 배경으로 그린다.
// Vector(node 253:958 / 256:574 / 260:644, x:26 y:43 w:13 h:23) + 진행 바 트랙(x:24 y:89 w:354 h:4, gap:6)
// — 세 화면 모두 동일한 좌표. ONB-01은 이전 단계가 없어 뒤로가기 버튼을 시각적으로만 노출한다(no-op).
function FigmaStepHeader({ onBack, filledSegments }: { onBack: () => void; filledSegments: number }) {
  return (
    <>
      <Pressable
        onPress={onBack}
        hitSlop={16}
        style={({ pressed }) => [styles.figmaBackButton, pressed && styles.pressed]}>
        <Image
          source={require('@/assets/images/figma-icon-onboarding-back.png')}
          style={styles.figmaBackIcon}
          contentFit="contain"
        />
      </Pressable>
      <View style={styles.figmaProgressRow}>
        {Array.from({ length: STEP_COUNT }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.figmaProgressSegment,
              { backgroundColor: index < filledSegments ? Colors.primaryDark : Colors.mutedGray },
            ]}
          />
        ))}
      </View>
    </>
  );
}

// ONB-02("온보딩 2", node 256:573): HealthKit 수면 데이터 읽기 권한을 요청한다.
// 텍스트/색상/좌표/에셋은 모두 Figma 노드 값을 그대로 옮겼다.
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
  const connected = status === 'connected';

  return (
    <View style={styles.figmaCanvas}>
      <FigmaStepHeader onBack={onBack} filledSegments={2} />

      {/* "image 38" (node 256:617) — 프레임의 자식 레이어는 아니지만 같은 캔버스에서 프레임과
          겹쳐 배치된 애플워치 아이콘. 화면 폭 기준 수평 중앙 정렬. */}
      <View style={styles.sleepWatchIconWrap}>
        <Image
          source={require('@/assets/images/figma-icon-onboarding-watch.png')}
          style={styles.sleepWatchIcon}
          contentFit="contain"
        />
      </View>

      {/* "지난 기록을 알면, 다음 기록을 바꿀 수 있어요" (node 256:619, x:57 y:287 w:270 h:65) */}
      <Text style={styles.sleepTitle}>
        지난 기록을 알면,{'\n'}다음 기록을 바꿀 수 있어요
      </Text>
      {/* "Apple Health 데이터를 연동해요" (node 258:620, x:95 y:362 w:183 h:17) */}
      <Text style={styles.sleepSubtitle}>Apple Health 데이터를 연동해요</Text>

      {/* 4개 지표 리스트 (node 259:622/628/633/623, y:410~524, 행 간격 17).
          체크 아이콘은 텍스트 길이와 무관하게 항상 프레임 기준 x:98에서 시작하고(세로 일직선),
          텍스트는 항상 아이콘 기준 +34px(아이콘 21 + 여백 13)에서 시작한다 — 4항목 모두 동일. */}
      <View style={styles.sleepFeatureList}>
        {SLEEP_METRICS.map((metric) => (
          <View key={metric.label} style={styles.sleepFeatureRow}>
            <View style={styles.sleepFeatureIconBadge}>
              <Image
                source={require('@/assets/images/figma-icon-onboarding-check.png')}
                style={styles.sleepFeatureIconGlyph}
                contentFit="contain"
              />
            </View>
            <Text style={styles.sleepFeatureLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>

      {/* 개인정보 고지 (node 260:638, x:82 y:569 w:219 h:28) */}
      <Text style={styles.sleepPrivacyNote}>
        수면 데이터는 AI 코칭(open ai)에 활용됩니다.{'\n'}이름/ 이메일 등 개인정보는 전송되지 않습니다.
      </Text>

      {/* "이전" (node 260:642, x:66 y:722) */}
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.sleepBackLabelWrap, pressed && styles.pressed]}>
        <Text style={styles.sleepBackLabel}>이전</Text>
      </Pressable>

      {/* "연동하기" 버튼 (node 260:640, x:231 y:707 w:127 h:50, radius:26.5) */}
      <Pressable
        onPress={onOpenHealthAccess}
        disabled={connected}
        style={({ pressed }) => [
          styles.sleepConnectButton,
          connected && styles.buttonDisabled,
          pressed && !connected && styles.pressed,
        ]}>
        <Text style={styles.sleepConnectButtonText}>{connectLabel}</Text>
      </Pressable>
    </View>
  );
}

// ONB-03("온보딩 3", node 260:643): HealthKit 권한 상세 확인 + 최종 CTA.
// 본문(제목·설명·"읽어올 데이터" 카드·CTA)은 프레임의 자식이 아니라 같은 캔버스에서 프레임과
// 겹쳐 배치된 loose 오브젝트(node 261:676/677/678/699)였다 — 프레임 원점 기준 좌표로 역산해 옮겼다.
function HealthConnectStep({ onBack, onFinish }: { onBack: () => void; onFinish: () => void }) {
  return (
    <View style={styles.figmaCanvas}>
      <FigmaStepHeader onBack={onBack} filledSegments={3} />

      {/* "수면 데이터를 연결해주세요" (node 261:676, x:28 y:157 w:345 h:35) */}
      <Text style={styles.healthTitle}>수면 데이터를 연결해주세요</Text>
      {/* 설명 (node 261:677, x:28 y:205 w:345 h:44) */}
      <Text style={styles.healthSubtitle}>
        SkinCast는 애플 건강 앱의 수면 기록만 읽습니다. 쓰기 권한은 요청하지 않으며, 언제든 해제할 수 있어요.
      </Text>

      {/* "읽어올 데이터" 카드 (node 261:678, x:28 y:265 w:345, fill #F4F4F4, radius:12) */}
      <View style={styles.healthCard}>
        {HEALTH_DATA_ITEMS.map((item) => (
          <View key={item.title} style={styles.healthCardRow}>
            <View style={styles.healthCardCheckbox} />
            <View style={styles.healthCardTextGroup}>
              <Text style={styles.healthCardItemTitle}>{item.title}</Text>
              <Text style={styles.healthCardItemSubtitle}>{item.subtitle}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* CTA (node 261:699, x:28 y:705 w:345, gap:8) — 연결/스킵 모두 온보딩을 완료시킨다
          (ONB-02 HealthAccessModal의 허용/거부 수렴 패턴과 동일). */}
      <View style={styles.healthCta}>
        <Pressable
          onPress={onFinish}
          style={({ pressed }) => [styles.healthPrimaryButton, pressed && styles.pressed]}>
          <Text style={styles.healthPrimaryButtonText}>건강 앱 연결하기</Text>
        </Pressable>
        <Pressable
          onPress={onFinish}
          style={({ pressed }) => [styles.healthGhostButton, pressed && styles.pressed]}>
          <Text style={styles.healthGhostButtonText}>나중에 할게요</Text>
        </Pressable>
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
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [healthStatus, setHealthStatus] = useState<HealthKitStatus>('idle');
  const [healthModalVisible, setHealthModalVisible] = useState(false);

  const handleAllowHealthAccess = () => {
    // TODO(ONB-02): 실제 HealthKit 읽기 권한 요청(react-native-health 등)으로 교체한다.
    setHealthStatus('connected');
    setHealthModalVisible(false);
    setStep(2);
  };

  const handleDenyHealthAccess = () => {
    // 연결(yes)·미연결(no) 모두 다음 단계로 수렴한다 (docs ONB-02 비고).
    setHealthStatus('skipped');
    setHealthModalVisible(false);
    setStep(2);
  };

  return (
    <View style={styles.screen}>
      {/* HOME(node 187:2673)과 동일한 402x874 고정 캔버스. */}
      <ThemedView style={[styles.canvas, { marginTop: insets.top }]}>
        {step === 0 && <ValueStep onNext={() => setStep(1)} />}
        {step === 1 && (
          <SleepStep
            status={healthStatus}
            onOpenHealthAccess={() => setHealthModalVisible(true)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && <HealthConnectStep onBack={() => setStep(1)} onFinish={onComplete} />}
      </ThemedView>

      <HealthAccessModal
        visible={healthModalVisible}
        onAllow={handleAllowHealthAccess}
        onDeny={handleDenyHealthAccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  // HOME(index.tsx)과 동일한 고정 프레임 규격.
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    overflow: 'hidden',
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
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

  // ── ONB-01/02/03 공용 — 항상 고정 라이트 팔레트, 부모 테마 영향 없음 ──────────────────
  figmaCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
  },
  // Vector(node 253:958 / 256:574 / 260:644, x:26 y:43 w:13 h:23)
  figmaBackButton: {
    position: 'absolute',
    left: 26,
    top: 43,
    width: 13,
    height: 23,
  },
  figmaBackIcon: {
    width: '100%',
    height: '100%',
  },
  // 진행 바 트랙(x:24 y:89 w:354 h:4, gap:6) — ONB-01/02/03 공통
  figmaProgressRow: {
    position: 'absolute',
    left: 24,
    top: 89,
    width: 354,
    height: 4,
    flexDirection: 'row',
    gap: 6,
  },
  figmaProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },

  // ── ONB-01 "온보딩 1"(node 252:139) 전용 ────────────────────────────────────────
  // "당신의 \n피부 예보" (node 255:561, x:26 y:200 w:156 h:81)
  valueTitle: {
    position: 'absolute',
    left: 26,
    top: 200,
    width: 156,
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 42,
    color: '#000000',
  },
  // 설명 (node 256:562, x:26 y:305 w:360 h:48)
  valueBody: {
    position: 'absolute',
    left: 26,
    top: 305,
    width: 360,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 24,
    color: '#3F3F3F',
  },
  // "시작하기" 버튼 (node 256:563, x:25 y:706 w:351 h:53, radius:13)
  valuePrimaryButton: {
    position: 'absolute',
    left: 25,
    top: 706,
    width: 351,
    height: 53,
    borderRadius: 13,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuePrimaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.white,
  },
  // "이미 계정이 있어요" (node 256:565, x:125 y:781 w:157 h:17) — 프레임 폭 기준 중앙 정렬
  valueSecondaryButton: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 781,
    alignItems: 'center',
  },
  valueSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#5E5E5E',
  },

  // ── ONB-02 "온보딩 2"(node 256:573) 전용 ────────────────────────────────────────
  // "image 38"(node 256:617, 프레임 원점 기준 x:152 y:193 w:65 h:80) — 애플워치 아이콘
  sleepWatchIconWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 193,
    alignItems: 'center',
  },
  sleepWatchIcon: {
    width: 65,
    height: 80,
  },
  // "지난 기록을 알면, 다음 기록을 바꿀 수 있어요" (node 256:619, x:57 y:287 w:270 h:65)
  sleepTitle: {
    position: 'absolute',
    left: 0,
    top: 287,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: 0.72,
    color: SLEEP_TEXT_TITLE,
  },
  // "Apple Health 데이터를 연동해요" (node 258:620, x:95 y:362 w:183 h:17)
  sleepSubtitle: {
    position: 'absolute',
    left: 0,
    top: 362,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '300',
    color: SLEEP_TEXT_MUTED,
  },
  // 지표 리스트 (node 259:622/628/633/623, y:410 시작, 행 간격 17)
  // left:98 — 프레임 원점 기준, 4항목 모두 동일(글씨 길이와 무관하게 아이콘이 세로로 일직선).
  sleepFeatureList: {
    position: 'absolute',
    left: 98,
    top: 410,
    alignItems: 'flex-start',
    gap: 17,
  },
  sleepFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  // 아이콘 배지(21x21, radius:10.5, fill #031949) + 체크(componentId 243:638, 흰색, PNG 에셋)
  sleepFeatureIconBadge: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepFeatureIconGlyph: {
    width: 14,
    height: 18,
  },
  sleepFeatureLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: SLEEP_TEXT_BODY,
  },
  // 개인정보 고지 (node 260:638, x:82 y:569 w:219 h:28)
  sleepPrivacyNote: {
    position: 'absolute',
    left: 0,
    top: 569,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '300',
    lineHeight: 14,
    color: SLEEP_TEXT_MUTED,
  },
  // "이전" (node 260:642, x:66 y:722)
  sleepBackLabelWrap: {
    position: 'absolute',
    left: 66,
    top: 722,
  },
  sleepBackLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: SLEEP_TEXT_BACK_LABEL,
  },
  // "연동하기" 버튼 (node 260:640, x:231 y:707 w:127 h:50, radius:26.5)
  sleepConnectButton: {
    position: 'absolute',
    left: 231,
    top: 707,
    width: 127,
    height: 50,
    borderRadius: 26.5,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleepConnectButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.white,
  },

  // ── ONB-03 "온보딩 3"(node 260:643) 전용 ────────────────────────────────────────
  // 본문 좌측 여백 28px(≈ 프레임 폭 402 - 콘텐츠 폭 345, 좌우 대칭) — 4개 블록 공통.
  // "수면 데이터를 연결해주세요" (node 261:676, x:28 y:157 w:345 h:35)
  healthTitle: {
    position: 'absolute',
    left: 28,
    top: 157,
    width: 345,
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 35,
    color: HEALTH_TEXT_TITLE,
  },
  // 설명 (node 261:677, x:28 y:205 w:345 h:44)
  healthSubtitle: {
    position: 'absolute',
    left: 28,
    top: 205,
    width: 345,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
    color: HEALTH_TEXT_SUBTITLE,
  },
  // "읽어올 데이터" 카드 (node 261:678, x:28 y:265 w:345, fill #F4F4F4, radius:12, padding:4px 16px)
  healthCard: {
    position: 'absolute',
    left: 28,
    top: 265,
    width: 345,
    backgroundColor: HEALTH_CARD_BG,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  // 카드 행 (node 261:679 등, padding: 12px 0px, gap:12)
  healthCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  // 체크박스 자리(node 261:680 등, 20x20, radius:5, fill #DEDEDE)
  healthCardCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: HEALTH_CHECKBOX_BG,
  },
  healthCardTextGroup: {
    flex: 1,
    gap: 2,
  },
  healthCardItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 23,
    color: HEALTH_TEXT_TITLE,
  },
  healthCardItemSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
    color: HEALTH_TEXT_HINT,
  },
  // CTA (node 261:699, x:28 y:705 w:345, gap:8)
  healthCta: {
    position: 'absolute',
    left: 28,
    top: 705,
    width: 345,
    gap: 8,
  },
  // "건강 앱 연결하기" 버튼 (node 261:700, height:52, fill #031949, radius:10)
  healthPrimaryButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.white,
  },
  // "나중에 할게요" 버튼 (node 261:701, height:52, radius:10, 배경 없음)
  healthGhostButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthGhostButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: HEALTH_TEXT_SUBTITLE,
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
