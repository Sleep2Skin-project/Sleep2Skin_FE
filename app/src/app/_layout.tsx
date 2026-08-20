import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import {
  checkInAttendance,
  type AttendanceExpInfo,
  type AttendanceWeekDay,
} from "@/api/game";
import { checkHealth } from "@/api/health";
import { getUserMe, type UserMeData } from "@/api/user";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AttendanceFlow } from "@/components/attendance-flow";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { TEMP_USER_ID } from "@/constants/config";
import { useAccountDeletedSignal } from "@/hooks/use-account-reset-signal";
import { setAppStartForecast } from "@/hooks/use-app-start-forecast";
import {
  resetSleepScoreExpResult,
  setSleepScoreExpResult,
} from "@/hooks/use-sleep-score-exp";
import { uploadSleepSession } from "@/hooks/useHealthData";

SplashScreen.preventAutoHideAsync();

// HOME-04(POST /api/v1/users/me/attendance)는 서버가 타임존을 모르는 상태 API라 baseDate를
// 앱의 로컬 "오늘" 날짜로 계산해 보내야 한다 — 다른 화면(index.tsx 등)과 동일한 로컬 헬퍼를
// 이 파일에도 그대로 둔다(이 프로젝트는 baseDate 계산을 공용 유틸로 빼지 않고 화면별로 둔다).
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ONB-01(GET /api/v1/users/me)이 앱 진입점 라우팅을 결정하는 단 하나의 소스다.
// consentAgreed는 "동의한 적이 있는가"가 아니라 "지금 활성 약관 버전에 동의했는가"라서, 약관이
// 개정되면 기존 사용자도 다시 false가 될 수 있다 — 그래서 이 값을 AsyncStorage 등 기기 로컬에
// 영구 저장해 분기하면 절대 안 된다(버전 업을 앱이 영원히 모르게 된다). 매 앱 시작마다 이 API를
// 새로 호출해 서버 값만 신뢰한다.
type EntryRoute =
  | { kind: "loading" }
  | { kind: "needs-consent" }
  | { kind: "needs-onboarding" }
  | { kind: "ready"; profile: UserMeData }
  | { kind: "error" };

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // 온보딩(ONB-01~05)은 탭 밖 진입 플로우이므로 AppTabs(및 웹의 상단 탭 바) 대신 여기서 분기한다.
  const [entryRoute, setEntryRoute] = useState<EntryRoute>({ kind: "loading" });
  // HOME-04 — 온보딩을 지난 뒤(=앱 진입 시점) 한 번 호출한다. 하루에 여러 번 앱을 켜서 재호출해도
  // 서버가 중복 지급하지 않고 매번 200 OK로 응답하므로, 여기서 별도로 "오늘 이미 호출했는지"를
  // 캐싱할 필요는 없다 — 응답의 checkedIn만 보고 팝업 여부를 정하면 된다.
  // - 'pending': 아직 응답 안 옴 → ATT-01 팝업을 띄우지 않고 조용히 기다린다.
  // - checkedIn:false(그날 재호출) 또는 요청 실패 → 팝업 없이 바로 다음 화면으로 진행한다.
  // - checkedIn:true → ATT-01 팝업을 띄우고, 닫힐 때 attendanceSeen을 true로 바꾼다.
  const [attendanceCheckIn, setAttendanceCheckIn] = useState<
    | { status: "pending" }
    | {
        status: "checked-in";
        exp: AttendanceExpInfo;
        weekDays: AttendanceWeekDay[];
      }
    | { status: "skip" }
  >({ status: "pending" });
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
          setEntryRoute({ kind: "needs-consent" });
        } else if (!data.onboardingCompleted) {
          setEntryRoute({ kind: "needs-onboarding" });
        } else {
          setEntryRoute({ kind: "ready", profile: data });
        }
      })
      .catch((error) => {
        console.error("❌ 사용자 상태 조회 실패:", error);
        setEntryRoute({ kind: "error" });
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
    setEntryRoute({ kind: "needs-consent" });
    setAttendanceSeen(false);
    setAttendanceCheckIn({ status: "pending" });
    resetSleepScoreExpResult();
  }, [accountDeletedSignal]);

  const pastOnboarding = entryRoute.kind === "ready";

  useEffect(() => {
    if (!pastOnboarding) return;
    checkInAttendance(TEMP_USER_ID, getTodayDateString())
      .then(({ data }) => {
        setAttendanceCheckIn(
          data.checkedIn
            ? { status: "checked-in", exp: data.exp, weekDays: data.weekDays }
            : { status: "skip" },
        );
      })
      .catch((error) => {
        console.error("❌ 출석 체크인 실패:", error);
        setAttendanceCheckIn({ status: "skip" });
      });
  }, [pastOnboarding]);

  // POST /api/v1/sleep/sessions — 앱이 시작될 때마다 호출한다(새 수면 데이터가 없어도 그냥 호출 —
  // 서버가 정규화 해시로 재처리 여부를 판단). 이 호출 자체는 스펙상 여기서 매번 일어나야 하지만,
  // "수면 점수가 전날보다 올랐음/오늘 90점 이상" 팝업(SLEEP_SCORE_IMPROVED/SLEEP_SCORE_HIGH)은
  // 원래 시안대로 일간 리포트 화면을 처음 열었을 때 뜨는 게 맞아서, 여기서는 결과를
  // use-sleep-score-exp.ts store에 채워두기만 하고 팝업은 daily-report.tsx가 띄운다.
  useEffect(() => {
    if (!pastOnboarding) return;
    uploadSleepSession(TEMP_USER_ID)
      .then((data) => {
        // TEMP DEBUG — 팝업이 안 뜨는 원인 추적용. 확인 끝나면 제거.
        console.log(
          "[SLEEP_EXP_DEBUG] today(local)=",
          getTodayDateString(),
          "response=",
          JSON.stringify(data),
        );
        if (!data) return;
        // 예보는 processed 여부·sleepScore null 여부와 무관하게 항상 실려 온다 — 홈 화면
        // (index.tsx)이 같은 걸 GET /skin/forecast로 또 조회하지 않도록 여기서 캐시해둔다
        // (use-app-start-forecast.ts 참고, "앱 시작 직후엔 그 API가 필요 없다"는 스펙 규칙).
        setAppStartForecast(data.sleepDate, data.forecast);

        if (data.sleep.sleepScore === null) {
          console.log("[SLEEP_EXP_DEBUG] sleepScore가 null이라 팝업 스킵");
          return;
        }
        // 이 API가 지급하는 reason은 SLEEP_SCORE_IMPROVED/SLEEP_SCORE_HIGH 둘뿐이지만, 다른
        // reason이 섞여 와도 이 팝업은 "수면 점수" 사유분만 더해서 보여준다.
        const sleepScoreExpGained = data.exp.reasons
          .filter((reason) => reason.reason.startsWith("SLEEP_SCORE"))
          .reduce((sum, reason) => sum + reason.amount, 0);
        if (sleepScoreExpGained <= 0) {
          console.log(
            "[SLEEP_EXP_DEBUG] sleepScoreExpGained <= 0 이라 팝업 스킵. exp.reasons=",
            JSON.stringify(data.exp.reasons),
          );
          return;
        }
        console.log(
          "[SLEEP_EXP_DEBUG] store에 결과 저장 →",
          data.sleepDate,
          sleepScoreExpGained,
        );
        setSleepScoreExpResult({
          sleepDate: data.sleepDate,
          score: data.sleep.sleepScore,
          expGained: sleepScoreExpGained,
        });
      })
      .catch((error) => {
        // TEMP DEBUG
        console.log("[SLEEP_EXP_DEBUG] uploadSleepSession catch:", error);
        // 실패해도 별도 상태를 남기지 않는다 — store가 비어 있으면 daily-report.tsx가 그냥
        // 팝업을 안 띄운다(HOME-04와 동일하게 "오늘 이미 봤는지"를 캐싱할 필요가 없는 것과 같은
        // 이유로, "이번 실행에서 보여줄 게 없다"를 별도 상태로 구분하지 않는다).
        // 다만 원인 진단을 위해 로그는 남긴다 — 네트워크 실패뿐 아니라 위 .then() 콜백 안에서
        // (예: 응답 필드명이 기대와 달라 data.exp.reasons 접근이 실패하는 등) 예외가 나도 이
        // catch가 그대로 삼켜서, 로그가 없으면 "수면 세션 업로드는 성공했는데 팝업 조건 처리
        // 코드가 조용히 실패한 경우"를 구분할 방법이 없었다.
        console.error("❌ 수면 점수 exp 처리 실패:", error);
      });
  }, [pastOnboarding]);

  const showAttendancePopup =
    pastOnboarding &&
    attendanceCheckIn.status === "checked-in" &&
    !attendanceSeen;
  // pending 상태에서도 attendanceSeen을 미리 넘겨버리면 나중에 checked-in이 도착했을 때 팝업을
  // 놓치므로, attendanceSeen은 팝업을 실제로 닫았을 때 또는 이번 실행에서 팝업을 띄우지 않기로
  // (skip) 확정됐을 때만 true로 취급한다.
  const attendanceResolved =
    attendanceSeen || attendanceCheckIn.status === "skip";

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {(entryRoute.kind === "needs-consent" || entryRoute.kind === "error") && (
        <OnboardingFlow onComplete={loadEntryRoute} />
      )}
      {/* consentAgreed:true인데 onboardingCompleted:false — 동의는 이미 기록됐으므로 그 부분
          (ValueStep/PrivacyStep)은 건너뛰고 SleepStep(2)부터 이어서 진행한다(OnboardingFlow
          주석 참고). onComplete에서 setEntryRoute로 임의 확정하지 않고 다시 getUserMe를 불러
          서버 값을 재확인한다 — 도중에 동의/완료 처리 중 하나가 실패해도 그 사실을 정직하게
          반영하기 위함(로컬 낙관 플래그로 덮어쓰지 않음). */}
      {entryRoute.kind === "needs-onboarding" && (
        <OnboardingFlow initialStep={2} onComplete={loadEntryRoute} />
      )}
      {showAttendancePopup && (
        <AttendanceFlow
          onComplete={() => setAttendanceSeen(true)}
          exp={
            attendanceCheckIn.status === "checked-in"
              ? attendanceCheckIn.exp
              : undefined
          }
          weekDays={
            attendanceCheckIn.status === "checked-in"
              ? attendanceCheckIn.weekDays
              : []
          }
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
