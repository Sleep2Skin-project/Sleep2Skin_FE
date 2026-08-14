import { useFonts } from 'expo-font';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { completeUserOnboarding, saveUserConsent } from '@/api/user';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/colors';
import { TEMP_USER_ID } from '@/constants/config';
import { Spacing } from '@/constants/theme';
import { useDesignScale } from '@/hooks/use-design-scale';
import { useTheme } from '@/hooks/use-theme';

// ONB-01~05 온보딩(공통) 흐름 — 탭 밖 진입 플로우이므로 이 컴포넌트는 src/app/_layout.tsx에서
// AppTabs 대신 렌더된다.
// 전체 캔버스는 HOME(index.tsx, node 187:2673)과 동일한 402x874 고정 컨테이너 규격을 따른다.
// 화면 잘림 방지: 캔버스 내부 좌표는 그대로 두고, useDesignScale로 계산한 배율만큼
// transform: scale로 캔버스 전체를 기기 화면에 맞게 축소/확대한다(비율 스케일링).
// ONB-01("온보딩 1", node 252:139)·ONB-04("온보딩 4"=셀피 프라이버시 공지, node 432:880)·
// ONB-02("온보딩 2", node 256:573)·ONB-03("온보딩 3", node 260:643) 모두 Figma REST API로
// 좌표·색상·타이포를 그대로 옮겼고, 부모 테마(다크모드)와 무관하게 항상 Figma 지정 배경(#FFFFFF)
// 으로 렌더한다. 네 화면 모두 본문(제목/리스트/CTA 등)이 프레임의 자식 레이어가 아니라 같은 Figma
// 캔버스 위에 프레임과 겹쳐 배치된 loose 오브젝트라, 프레임 원점을 기준으로 좌표를 역산해 옮겼다.
const CANVAS_WIDTH = 402;
const CANVAS_HEIGHT = 874;
const STEP_COUNT = 4;

const SLEEP_TEXT_TITLE = '#050505';
const SLEEP_TEXT_BODY = '#1A2B4C';
const SLEEP_TEXT_MUTED = '#5C6B7A';
const SLEEP_TEXT_BACK_LABEL = '#6B6B6B';

const HEALTH_TEXT_TITLE = '#1A1A1A';
const HEALTH_TEXT_SUBTITLE = '#6B6B6B';
const HEALTH_TEXT_HINT = '#9E9E9E';
const HEALTH_CARD_BG = '#F4F4F4';
const HEALTH_CHECKBOX_BG = '#DEDEDE';

const PRIVACY_TEXT_TITLE = '#000000';
const PRIVACY_TEXT_MUTED = '#868686';
const PRIVACY_TEXT_DESC = '#858585';
const PRIVACY_LINK_COLOR = '#4B7CEA';

// ONB-01/02/03/04 전용 Pretendard 폰트(라이트~볼드 5종). Figma 시안 텍스트가 전부 이 폰트
// 기준으로 크기·박스가 잡혀 있어, 시스템 폴백 폰트로 렌더하면 글자 폭이 달라져 줄바꿈/잘림이
// 생긴다 — 온보딩 화면에만 로컬로 번들링해 이 문제를 근본적으로 없앤다(다른 화면엔 영향 없음).
const PRETENDARD_LIGHT = 'Pretendard-Light';
const PRETENDARD_REGULAR = 'Pretendard-Regular';
const PRETENDARD_MEDIUM = 'Pretendard-Medium';
const PRETENDARD_SEMIBOLD = 'Pretendard-SemiBold';
const PRETENDARD_BOLD = 'Pretendard-Bold';

const PRETENDARD_FONTS = {
  [PRETENDARD_LIGHT]: require('@/assets/fonts/Pretendard-Light.otf'),
  [PRETENDARD_REGULAR]: require('@/assets/fonts/Pretendard-Regular.otf'),
  [PRETENDARD_MEDIUM]: require('@/assets/fonts/Pretendard-Medium.otf'),
  [PRETENDARD_SEMIBOLD]: require('@/assets/fonts/Pretendard-SemiBold.otf'),
  [PRETENDARD_BOLD]: require('@/assets/fonts/Pretendard-Bold.otf'),
};

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

// ONB-04("온보딩 4"=셀피 프라이버시 공지, node 432:880): 셀피 원본 이미지를 저장하지 않는다는
// 개인정보 보호 방침을 안내한다. 텍스트/색상/좌표/에셋은 모두 Figma 노드 값을 그대로 옮겼다.
function PrivacyStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <View style={styles.figmaCanvas}>
      <FigmaStepHeader onBack={onBack} filledSegments={2} />

      {/* "image 54" (node 432:890) — 히어로 방패 아이콘. 화면 폭 기준 수평 중앙 정렬. */}
      <Image
        source={require('@/assets/images/figma-icon-onboarding-privacy-shield.png')}
        style={styles.privacyHeroIcon}
        contentFit="contain"
      />

      {/* "셀피는 저장하지 않습니다" (node 432:891, x:44 y:224 w:324 h:44, Pretendard Bold 32px) */}
      <Text style={styles.privacyTitle}>셀피는 저장하지 않습니다</Text>

      {/* 설명 (node 432:892, x:72 y:274 w:274 h:34, 원문 그대로 줄바꿈 2줄) */}
      <Text style={styles.privacyBody}>
        Sleep2Skin은 당신의 데이터를 안전하게 보호합니다.{'\n'}필요한 최소한의 데이터만 수집해요.
      </Text>

      {/* "개인 정보 보호" 섹션 (group node 464:885, 프레임 원점 기준 x:78.83 y:339) */}
      {/* "image 59" (node 464:889, x:44 y:341 w:27.62 h:28.82) — 섹션 헤더 좌측 방패 아이콘 */}
      <Image
        source={require('@/assets/images/figma-icon-onboarding-privacy-lock-small.png')}
        style={styles.privacySectionIcon}
        contentFit="contain"
      />
      {/* "개인 정보 보호" (node 464:872, rel(11.61,0) → 절대 x:90 y:339 w:116 h:33) */}
      <Text style={styles.privacySectionTitle}>개인 정보 보호</Text>

      {/* 리스트 3항목 — group 464:885 원점(78.83,339) 기준 좌표를 그대로 역산한 절대 좌표.
          행 간격이 완전히 균일하지 않아(65.9px/67.26px) 노드별 절대값을 그대로 옮겼다. */}
      {/* Row1: "숫자 지표만 저장" 타이틀(464:881, rel(0.17,52)→abs x:79 y:391 w:126 h:25) +
          설명(464:882, rel(24.02,77.66)→abs x:103 y:417 w:144 h:19) */}
      <Text style={styles.privacyPointTitle1}>{'  - 숫자 지표만 저장'}</Text>
      <Text style={styles.privacyPointDesc1}>데이터는 익명화되어 저장돼요.</Text>

      {/* Row2: "언제든 전체 삭제" 타이틀(464:883, rel(0,117.9)→abs x:79 y:457 w:126 h:25) +
          설명(464:884, rel(24.02,143.12)→abs x:103 y:482 w:174 h:19) */}
      <Text style={styles.privacyPointTitle2}>{'  - 언제든 전체 삭제'}</Text>
      <Text style={styles.privacyPointDesc2}>설정에서 내 데이터를 지울 수 있어요.</Text>

      {/* Row3: "셀피(원본 이미지) 즉시 폐기" 타이틀(464:876, rel(0,185.16)→abs x:79 y:524 w:195 h:25) +
          설명(464:877, rel(22.82,211.58)→abs x:102 y:551 w:174 h:19) */}
      <Text style={styles.privacyPointTitle3}>{'  - 셀피(원본 이미지) 즉시 폐기'}</Text>
      <Text style={styles.privacyPointDesc3}>
        분석 후 원본 이미지는 바로 삭제돼요.
      </Text>

      {/* 푸터 (group node 464:898, 절대 x:87 y:782 w:263 h:36) — Figma 원본은 텍스트(node 464:887)
          맨 앞에 아이콘 자리만큼 공백 3칸을 넣어두고, "image 61"(node 464:896, rel(10,0)→박스
          기준 x:10 y:0 w:17 h:16) 아이콘을 그 공백 위에 겹쳐 그린 구조다. flexbox gap/margin으로
          근사하지 않고 이 구조를 그대로 재현해 아이콘과 글자가 항상 정확히 같은 간격으로 붙는다. */}
      <View style={styles.privacyFooterBox}>
        <Image
          source={require('@/assets/images/figma-icon-onboarding-privacy-lock-tiny.png')}
          style={styles.privacyFooterIcon}
          contentFit="contain"
        />
        <Text style={styles.privacyFooterText}>
          {'   '}모든 데이터는 암호화되어 안전하게 관리돼요{'\n'}자세한 내용은{' '}
          <Text style={styles.privacyFooterLink}>개인정보처리방침</Text>에서 확인 할 수 있어요.
        </Text>
      </View>

      {/* "시작하기" 버튼 (node 432:881/882, x:25 y:706 w:351 h:53, radius:13) — ONB-01
          "시작하기" 버튼과 동일 스타일/좌표. */}
      <Pressable
        onPress={onNext}
        style={({ pressed }) => [styles.valuePrimaryButton, pressed && styles.pressed]}>
        <Text style={styles.valuePrimaryButtonText}>시작하기</Text>
      </Pressable>
    </View>
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
      <FigmaStepHeader onBack={onBack} filledSegments={3} />

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
function HealthConnectStep({
  onBack,
  onFinish,
  completing,
}: {
  onBack: () => void;
  onFinish: () => void;
  completing: boolean;
}) {
  return (
    <View style={styles.figmaCanvas}>
      <FigmaStepHeader onBack={onBack} filledSegments={4} />

      {/* "수면 데이터를 연결해주세요" (node 261:676, x:28 y:157 w:345 h:35) */}
      <Text style={styles.healthTitle}>수면 데이터를 연결해주세요</Text>
      {/* 설명 (node 261:677, x:28 y:205 w:345 h:44) */}
      <Text style={styles.healthSubtitle}>
        Sleep2Skin은 애플 건강 앱의 수면 기록만 읽습니다. 쓰기 권한은 요청하지 않으며, 언제든 해제할 수 있어요.
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
          (ONB-02 HealthAccessModal의 허용/거부 수렴 패턴과 동일). 완료 처리 중에는 중복 탭 방지. */}
      <View style={styles.healthCta}>
        <Pressable
          onPress={onFinish}
          disabled={completing}
          style={({ pressed }) => [
            styles.healthPrimaryButton,
            completing && styles.buttonDisabled,
            pressed && !completing && styles.pressed,
          ]}>
          <Text style={styles.healthPrimaryButtonText}>{completing ? '처리 중...' : '건강 앱 연결하기'}</Text>
        </Pressable>
        <Pressable
          onPress={onFinish}
          disabled={completing}
          style={({ pressed }) => [
            styles.healthGhostButton,
            completing && styles.buttonDisabled,
            pressed && !completing && styles.pressed,
          ]}>
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
              &apos;Sleep2Skin&apos;이 사용자의 건강 데이터에 접근하여 업데이트하려고 합니다.
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
              &apos;Sleep2Skin&apos;의 읽기 항목
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
  const scale = useDesignScale(CANVAS_WIDTH, CANVAS_HEIGHT);
  const [fontsLoaded] = useFonts(PRETENDARD_FONTS);
  const [step, setStep] = useState(0);
  const [healthStatus, setHealthStatus] = useState<HealthKitStatus>('idle');
  const [healthModalVisible, setHealthModalVisible] = useState(false);
  const [completing, setCompleting] = useState(false);

  // ONB-03 CTA(연결/스킵 공용) — 온보딩 완료 시점에 개인정보 동의와 온보딩 완료 처리를 순서대로 호출한다.
  // API 실패는 axios 인터셉터가 이미 로깅하므로, 실패해도 온보딩 자체는 막지 않고 앱으로 진입시킨다.
  const handleFinishOnboarding = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await saveUserConsent(TEMP_USER_ID);
      await completeUserOnboarding(TEMP_USER_ID);
    } catch {
      // no-op: 에러는 axios 인터셉터가 이미 로깅했다.
    } finally {
      setCompleting(false);
      onComplete();
    }
  };

  const handleAllowHealthAccess = () => {
    // TODO(ONB-02): 실제 HealthKit 읽기 권한 요청(react-native-health 등)으로 교체한다.
    setHealthStatus('connected');
    setHealthModalVisible(false);
    setStep(3);
  };

  const handleDenyHealthAccess = () => {
    // 연결(yes)·미연결(no) 모두 다음 단계로 수렴한다 (docs ONB-02 비고).
    setHealthStatus('skipped');
    setHealthModalVisible(false);
    setStep(3);
  };

  // Figma 지정 Pretendard 폰트가 로드되기 전엔 시스템 폰트로 잘못된 크기가 잠깐 그려질 수 있으므로,
  // 로드 완료 전까지는 흰 배경만 렌더한다. 이 시점엔 AnimatedSplashOverlay(zIndex:1000, 최소 2초
  // 유지)가 화면 전체를 덮고 있어 실제로는 깜빡임 없이 가려진다.
  if (!fontsLoaded) {
    return <SafeAreaView style={styles.screen} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* HOME(node 187:2673)과 동일한 402x874 고정 캔버스를 기기 화면에 맞게 스케일링한다. */}
      <View style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }}>
        <ThemedView style={[styles.canvas, { transform: [{ scale }], transformOrigin: 'top left' }]}>
          {step === 0 && <ValueStep onNext={() => setStep(1)} />}
          {step === 1 && <PrivacyStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && (
            <SleepStep
              status={healthStatus}
              onOpenHealthAccess={() => setHealthModalVisible(true)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <HealthConnectStep onBack={() => setStep(2)} onFinish={handleFinishOnboarding} completing={completing} />
          )}
        </ThemedView>
      </View>

      <HealthAccessModal
        visible={healthModalVisible}
        onAllow={handleAllowHealthAccess}
        onDeny={handleDenyHealthAccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // backgroundColor: 스케일된 캔버스가 화면 폭보다 좁아 남는 여백(레터박스)도 캔버스와 같은
  // Figma 지정 흰 배경으로 채워, 여백이 이질적인 색으로 도드라지지 않게 한다.
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.white,
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
    fontFamily: PRETENDARD_BOLD,
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
    fontFamily: PRETENDARD_MEDIUM,
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
    fontFamily: PRETENDARD_SEMIBOLD,
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
    fontFamily: PRETENDARD_MEDIUM,
    color: '#5E5E5E',
  },

  // ── ONB-04 "온보딩 4"=셀피 프라이버시 공지(node 432:880) 전용 ─────────────────────────
  // "image 54"(node 432:890, x:183 y:157 w:39 h:45.27) — 프레임 폭 기준 수평 중앙 정렬
  // (183 + 39/2 ≈ 202.5, 프레임 중앙 201).
  privacyHeroIcon: {
    position: 'absolute',
    left: 183,
    top: 157,
    width: 39,
    height: 45,
  },
  // "셀피는 저장하지 않습니다" (node 432:891, x:44 y:224 w:324 h:44, Pretendard Bold 32px) —
  // 폰트를 Figma 지정 Pretendard로 번들링해 박스 폭 그대로 한 줄에 맞는다.
  privacyTitle: {
    position: 'absolute',
    left: 44,
    top: 224,
    width: 324,
    height: 44,
    fontSize: 32,
    fontFamily: PRETENDARD_BOLD,
    lineHeight: 44,
    color: PRIVACY_TEXT_TITLE,
  },
  // 설명 (node 432:892, x:72 y:274 w:274 h:34, 원문 \n 그대로 2줄) — 프레임 폭 기준 중앙 정렬
  // (원본 박스 중심 209 ≈ 프레임 중앙 201)로 옮겼다.
  privacyBody: {
    position: 'absolute',
    left: 0,
    top: 274,
    width: CANVAS_WIDTH,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: PRETENDARD_MEDIUM,
    lineHeight: 17,
    color: PRIVACY_TEXT_MUTED,
  },
  // "image 59" (node 464:889, x:44 y:341 w:27.62 h:28.82)
  privacySectionIcon: {
    position: 'absolute',
    left: 44,
    top: 341,
    width: 28,
    height: 29,
  },
  // "개인 정보 보호" 헤더 (node 464:872, group 464:885 원점 x:78.83 y:339 기준 rel(11.61,0)
  // → 절대 좌표 x:90 y:339, w:116 h:33, Pretendard SemiBold 20.42px)
  privacySectionTitle: {
    position: 'absolute',
    left: 90,
    top: 339,
    width: 116,
    height: 33,
    fontSize: 20.42,
    fontFamily: PRETENDARD_SEMIBOLD,
    lineHeight: 33,
    color: PRIVACY_TEXT_TITLE,
  },
  // Row1 타이틀 (node 464:881, group 원점 기준 rel(0.17,52) → 절대 x:79 y:391 w:126 h:25,
  // Pretendard SemiBold 15.61px)
  privacyPointTitle1: {
    position: 'absolute',
    left: 79,
    top: 391,
    width: 126,
    height: 25,
    fontSize: 15.61,
    fontFamily: PRETENDARD_SEMIBOLD,
    lineHeight: 25,
    color: PRIVACY_TEXT_TITLE,
  },
  // Row1 설명 (node 464:882, rel(24.02,77.66) → 절대 x:103 y:417 w:144 h:19, Pretendard
  // Medium 12.01px)
  privacyPointDesc1: {
    position: 'absolute',
    left: 103,
    top: 417,
    width: 144,
    height: 19,
    fontSize: 12.01,
    fontFamily: PRETENDARD_MEDIUM,
    lineHeight: 19,
    color: PRIVACY_TEXT_DESC,
  },
  // Row2 타이틀 (node 464:883, rel(0,117.9) → 절대 x:79 y:457 w:126 h:25)
  privacyPointTitle2: {
    position: 'absolute',
    left: 79,
    top: 457,
    width: 126,
    height: 25,
    fontSize: 15.61,
    fontFamily: PRETENDARD_SEMIBOLD,
    lineHeight: 25,
    color: PRIVACY_TEXT_TITLE,
  },
  // Row2 설명 (node 464:884, rel(24.02,143.12) → 절대 x:103 y:482 w:174 h:19)
  privacyPointDesc2: {
    position: 'absolute',
    left: 103,
    top: 482,
    width: 174,
    height: 19,
    fontSize: 12.01,
    fontFamily: PRETENDARD_MEDIUM,
    lineHeight: 19,
    color: PRIVACY_TEXT_DESC,
  },
  // Row3 타이틀 (node 464:876, rel(0,185.16) → 절대 x:79 y:524 w:195 h:25)
  privacyPointTitle3: {
    position: 'absolute',
    left: 79,
    top: 524,
    width: 195,
    height: 25,
    fontSize: 15.61,
    fontFamily: PRETENDARD_SEMIBOLD,
    lineHeight: 25,
    color: PRIVACY_TEXT_TITLE,
  },
  // Row3 설명 (node 464:877, rel(22.82,211.58) → 절대 x:102 y:551 w:174 h:19)
  privacyPointDesc3: {
    position: 'absolute',
    left: 102,
    top: 551,
    width: 174,
    height: 19,
    fontSize: 12.01,
    fontFamily: PRETENDARD_MEDIUM,
    lineHeight: 19,
    color: PRIVACY_TEXT_DESC,
  },
  // 푸터 박스 (group node 464:898, 절대 x:87 y:782 w:263 h:36) — 아이콘("image 61")과 텍스트가
  // 이 박스 안에서 겹쳐 배치된다.
  privacyFooterBox: {
    position: 'absolute',
    left: 87,
    top: 782,
    width: 263,
  },
  // "image 61" (node 464:896, 박스 원점 기준 rel(10,0) → w:17 h:16) — 텍스트 첫 줄의 공백 3칸
  // 위에 그대로 겹쳐 그린다.
  privacyFooterIcon: {
    position: 'absolute',
    left: 10,
    top: 0,
    width: 17,
    height: 16,
  },
  // 푸터 텍스트 (node 464:887, w:263 h:36, 원문 그대로 첫 줄 앞에 공백 3칸 + \n 2줄)
  privacyFooterText: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: PRETENDARD_MEDIUM,
    lineHeight: 18,
    color: PRIVACY_TEXT_MUTED,
  },
  privacyFooterLink: {
    color: PRIVACY_LINK_COLOR,
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
    fontFamily: PRETENDARD_BOLD,
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
    fontFamily: PRETENDARD_LIGHT,
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
    fontFamily: PRETENDARD_MEDIUM,
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
    fontFamily: PRETENDARD_LIGHT,
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
    fontFamily: PRETENDARD_SEMIBOLD,
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
    fontFamily: PRETENDARD_MEDIUM,
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
    fontFamily: PRETENDARD_BOLD,
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
    fontFamily: PRETENDARD_REGULAR,
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
    fontFamily: PRETENDARD_MEDIUM,
    lineHeight: 23,
    color: HEALTH_TEXT_TITLE,
  },
  healthCardItemSubtitle: {
    fontSize: 12,
    fontFamily: PRETENDARD_REGULAR,
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
    fontFamily: PRETENDARD_MEDIUM,
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
    fontFamily: PRETENDARD_MEDIUM,
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
