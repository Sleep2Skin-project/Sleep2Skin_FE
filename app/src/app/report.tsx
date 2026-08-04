import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

// REPORT 탭 '일간' 화면(REP-01~05)의 임시 자리 표시자.
// HOME-02 수면 요약 카드 탭 시 이동하는 목적지만 우선 연결해둔다.
export default function ReportScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <ThemedText style={styles.backChevron}>‹</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">일간 리포트</ThemedText>
          <View style={styles.backButton} />
        </View>

        <View style={styles.body}>
          <ThemedText themeColor="textSecondary" style={styles.placeholderText}>
            일간 수면/피부 리포트 🛠️{'\n'}디자인 준비 중입니다.
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: Spacing.five,
    height: Spacing.five,
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 28,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
});
