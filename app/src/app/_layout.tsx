import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import { checkHealth } from "@/api/health";
import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { AttendanceFlow } from "@/components/attendance-flow";
import { OnboardingFlow } from "@/components/onboarding-flow";

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // 온보딩(ONB-01~05)은 탭 밖 진입 플로우이므로 AppTabs(및 웹의 상단 탭 바) 대신 여기서 분기한다.
  // TODO(ONB-05): 로컬 스토리지에 저장된 온보딩 완료 플래그로 초기값을 결정해 재실행 시 건너뛴다.
  const [onboarded, setOnboarded] = useState(false);
  // ATT-01 — 온보딩 완료 직후, 홈(AppTabs) 진입 전에 "오늘 출석 완료" 화면을 한 번 보여준다.
  const [attendanceSeen, setAttendanceSeen] = useState(false);

  useEffect(() => {
    checkHealth()
      .then(({ data }) => {
        console.log(`✅ 백엔드 연결 성공: status - ${data.status}`);
      })
      .catch((error) => {
        console.error("❌ 백엔드 연결 실패:", error.message);
      });
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {!onboarded && <OnboardingFlow onComplete={() => setOnboarded(true)} />}
      {onboarded && !attendanceSeen && (
        <AttendanceFlow onComplete={() => setAttendanceSeen(true)} />
      )}
      {/* (tabs) 그룹(HOME/TODO/REPORT/MY, app-tabs.tsx의 NativeTabs)과 my-model.tsx를 형제
          화면으로 두는 Stack — my-model이 탭 위로 push되는 화면이 되려면 탭 바(NativeTabs)
          바깥에 별도 네비게이터가 있어야 한다(위 (tabs)/_layout.tsx 주석 참고). */}
      {onboarded && attendanceSeen && (
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
