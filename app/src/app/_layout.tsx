import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import { checkInAttendance, type AttendanceExpInfo } from '@/api/game';
import { checkHealth } from '@/api/health';
import { getUserMe, type UserMeData } from '@/api/user';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AttendanceFlow } from '@/components/attendance-flow';
import { OnboardingFlow } from '@/components/onboarding-flow';
import { TEMP_USER_ID } from '@/constants/config';
import { useAccountDeletedSignal } from '@/hooks/use-account-reset-signal';

SplashScreen.preventAutoHideAsync();

// HOME-04(POST /api/v1/users/me/attendance)는 서버가 타임존을 모르는 상태 API라 baseDate를
// 앱의 로컬 "오늘" 날짜로 계산해 보내야 한다 — 다른 화면(index.tsx 등)과 동일한 로컬 헬퍼를
// 이 파일에도 그대로 둔다(이 프로젝트는 baseDate 계산을 공용 유틸로 빼지 않고 화면별로 둔다).
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ONB-01(GET /api/v1/users/me)이 앱 진입점 라우팅을 결정하는 단 하나의 소스다.
// consentAgreed는 "동의한 적이 있는가"가 아니라 "지금 활성 약관 버전에 동의했는가"라서, 약관이
// 개정되면 기존 사용자도 다시 false가 될 수 있다 — 그래서 이 값을 AsyncStorage 등 기기 로컬에
// 영구 저장해 분기하면 절대 안 된다(버전 업을 앱이 영원히 모르게 된다). 매 앱 시작마다 이 API를
// 새로 호출해 서버 값만 신뢰한다.
type EntryRoute =
  | { kind: 'loading' }
  | { kind: 'needs-consent' }
  | { kind: 'needs-onboarding' }
  | { kind: 'ready'; profile: UserMeData }
  | { kind: 'error' };

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // 온보딩(ONB-01~05)은 탭 밖 진입 플로우이므로 AppTabs(및 웹의 상단 탭 바) 대신 여기서 분기한다.
  const [entryRoute, setEntryRoute] = useState<EntryRoute>({ kind: 'loading' });
  // HOME-04 — 온보딩을 지난 뒤(=앱 진입 시점) 한 번 호출한다. 하루에 여러 번 앱을 켜서 재호출해도
  // 서버가 중복 지급하지 않고 매번 200 OK로 응답하므로, 여기서 별도로 "오늘 이미 호출했는지"를
  // 캐싱할 필요는 없다 — 응답의 checkedIn만 보고 팝업 여부를 정하면 된다.
  // - 'pending': 아직 응답 안 옴 → ATT-01 팝업을 띄우지 않고 조용히 기다린다.
  // - checkedIn:false(그날 재호출) 또는 요청 실패 → 팝업 없이 바로 다음 화면으로 진행한다.
  // - checkedIn:true → ATT-01 팝업을 띄우고, 닫힐 때 attendanceSeen을 true로 바꾼다.
  const [attendanceCheckIn, setAttendanceCheckIn] = useState<
    { status: 'pending' } | { status: 'checked-in'; exp: AttendanceExpInfo } | { status: 'skip' }
  >({ status: 'pending' });
  const [attendanceSeen, setAttendanceSeen] = useState(false);
  // MY-04(회원 탈퇴) 성공 신호 — my.tsx가 use-account-reset-signal.ts를 통해 이 값을 올린다.
  const accountDeletedSignal = useAccountDeletedSignal();

  // consentAgreed/onboardingCompleted 조합만으로 다음 화면을 정한다(ONB-01 규칙 1). 실패 시엔
  // "동의 화면부터"와 동일하게 취급한다 — 서버 진위를 모르는 상태에서 무작정 홈으로 들여보내는
  // 것보단 안전한 기본값이다(다른 화면들도 실패를 에러로만 로깅하고 흐름을 막지 않는 이 앱의
  // 기존 관례와 동일).
  const loadEntryRoute = () => {
    getUserMe(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => {
        if (!data.consentAgreed) {
          setEntryRoute({ kind: 'needs-consent' });
        } else if (!data.onboardingCompleted) {
          setEntryRoute({ kind: 'needs-onboarding' });
        } else {
          setEntryRoute({ kind: 'ready', profile: data });
        }
      })
      .catch((error) => {
        console.error('❌ 사용자 상태 조회 실패:', error);
        setEntryRoute({ kind: 'error' });
      });
  };

  useEffect(() => {
    checkHealth()
      .then(({ data }) => {
        console.log(`✅ 백엔드 연결 성공: status - ${data.status}`);
      })
      .catch((error) => {
        console.error("❌ 백엔드 연결 실패:", error.message);
      });
    loadEntryRoute();
  }, []);

  // MY-04 완료 후 — 서버가 어느 화면으로 갈지 정해주지 않으므로(라우팅은 100% 클라이언트 책임)
  // 여기서 상태를 전부 초기화하고 동의/온보딩 화면으로 강제로 되돌린다. 절대 홈/탭에 남겨두지
  // 않는다: entryRoute를 'needs-consent'로 되돌리면 아래 (tabs) Stack 조건(pastOnboarding)이
  // 즉시 false가 되어 홈/MY 등 탭 트리 전체가 언마운트된다.
  useEffect(() => {
    if (accountDeletedSignal === 0) return; // 초기값 — 아직 삭제 신호 없음
    setEntryRoute({ kind: 'needs-consent' });
    setAttendanceSeen(false);
    setAttendanceCheckIn({ status: 'pending' });
  }, [accountDeletedSignal]);

  const pastOnboarding = entryRoute.kind === 'ready';

  useEffect(() => {
    if (!pastOnboarding) return;
    checkInAttendance(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => {
        setAttendanceCheckIn(data.checkedIn ? { status: 'checked-in', exp: data.exp } : { status: 'skip' });
      })
      .catch((error) => {
        console.error('❌ 출석 체크인 실패:', error);
        setAttendanceCheckIn({ status: 'skip' });
      });
  }, [pastOnboarding]);

  const showAttendancePopup = pastOnboarding && attendanceCheckIn.status === 'checked-in' && !attendanceSeen;
  // pending 상태에서도 attendanceSeen을 미리 넘겨버리면 나중에 checked-in이 도착했을 때 팝업을
  // 놓치므로, attendanceSeen은 팝업을 실제로 닫았을 때 또는 이번 실행에서 팝업을 띄우지 않기로
  // (skip) 확정됐을 때만 true로 취급한다.
  const attendanceResolved = attendanceSeen || attendanceCheckIn.status === 'skip';

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {(entryRoute.kind === 'needs-consent' || entryRoute.kind === 'error') && (
        <OnboardingFlow onComplete={loadEntryRoute} />
      )}
      {/* consentAgreed:true인데 onboardingCompleted:false — 동의는 이미 기록됐으므로 그 부분
          (ValueStep/PrivacyStep)은 건너뛰고 SleepStep(2)부터 이어서 진행한다(OnboardingFlow
          주석 참고). onComplete에서 setEntryRoute로 임의 확정하지 않고 다시 getUserMe를 불러
          서버 값을 재확인한다 — 도중에 동의/완료 처리 중 하나가 실패해도 그 사실을 정직하게
          반영하기 위함(로컬 낙관 플래그로 덮어쓰지 않음). */}
      {entryRoute.kind === 'needs-onboarding' && <OnboardingFlow initialStep={2} onComplete={loadEntryRoute} />}
      {showAttendancePopup && (
        <AttendanceFlow
          onComplete={() => setAttendanceSeen(true)}
          exp={attendanceCheckIn.status === 'checked-in' ? attendanceCheckIn.exp : undefined}
        />
      )}
      {/* (tabs) 그룹(HOME/TODO/REPORT/MY, app-tabs.tsx의 NativeTabs)과 my-model.tsx를 형제
          화면으로 두는 Stack — my-model이 탭 위로 push되는 화면이 되려면 탭 바(NativeTabs)
          바깥에 별도 네비게이터가 있어야 한다(위 (tabs)/_layout.tsx 주석 참고). */}
      {pastOnboarding && attendanceResolved && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="my-model"
            options={{ animation: "slide_from_right" }}
          />
        </Stack>
      )}
    </ThemeProvider>
  );
}
