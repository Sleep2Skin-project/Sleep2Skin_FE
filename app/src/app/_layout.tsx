import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { checkHealth } from '@/api/health';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { OnboardingFlow } from '@/components/onboarding-flow';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // 온보딩(ONB-01~05)은 탭 밖 진입 플로우이므로 AppTabs(및 웹의 상단 탭 바) 대신 여기서 분기한다.
  // TODO(ONB-05): 로컬 스토리지에 저장된 온보딩 완료 플래그로 초기값을 결정해 재실행 시 건너뛴다.
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    checkHealth()
      .then(({ data }) => {
        console.log(`✅ 백엔드 연결 성공: status - ${data.status}`);
      })
      .catch((error) => {
        console.error('❌ 백엔드 연결 실패:', error.message);
      });
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {onboarded ? <AppTabs /> : <OnboardingFlow onComplete={() => setOnboarded(true)} />}
    </ThemeProvider>
  );
}
