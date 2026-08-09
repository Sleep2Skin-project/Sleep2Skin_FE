import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import classes from './animated-icon.module.css';
const DURATION = 300;

// 스플래시(Figma "브랜드 시안" node 171:3023, 달+구름 아이콘) — animated-icon.tsx(모바일)와
// 동일한 흰 배경 + 1.5초 대기 + 500ms 페이드아웃 시나리오를 웹에서도 그대로 재현한다.
const SPLASH_HOLD_DURATION = 1500;
const SPLASH_FADE_DURATION = 500;
const SPLASH_TOTAL_DURATION = SPLASH_HOLD_DURATION + SPLASH_FADE_DURATION;
const SPLASH_HOLD_PERCENT = (SPLASH_HOLD_DURATION / SPLASH_TOTAL_DURATION) * 100;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      opacity: 1,
    },
    [SPLASH_HOLD_PERCENT]: {
      opacity: 1,
    },
    100: {
      opacity: 0,
      easing: Easing.out(Easing.ease),
    },
  });

  const image = (
    <Image style={styles.splashImage} source={require('@/assets/images/figma-icon-splash-moon.png')} />
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(SPLASH_TOTAL_DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        // 웹에는 네이티브 스플래시 화면이 없어 hideAsync()가 동작하지 않거나(구현에 따라) 실패할 수
        // 있다 — 실패해도 페이드아웃 애니메이션은 항상 시작되도록 방어적으로 무시한다.
        Promise.resolve()
          .then(() => SplashScreen.hideAsync())
          .catch(() => {})
          .finally(() => {
            setAnimate(true);
          });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

const glowKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '-180deg' }, { scale: 0.8 }],
    opacity: 0,
  },
  [DURATION / 1000]: {
    transform: [{ rotateZ: '0deg' }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={glowKeyframe.duration(60 * 1000 * 4)} style={styles.glow}>
        <Image style={styles.glow} source={require('@/assets/images/logo-glow.png')} />
      </Animated.View>

      <Animated.View style={styles.background} entering={keyframe.duration(DURATION)}>
        <div className={classes.expoLogoBackground} />
      </Animated.View>

      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1000,
    position: 'absolute',
    top: 128 / 2 + 138,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  image: {
    position: 'absolute',
    width: 76,
    height: 71,
  },
  background: {
    width: 128,
    height: 128,
    position: 'absolute',
  },
  // 스플래시 달 아이콘 (Figma node 171:3023, 원본 248x248 정사각형) — animated-icon.tsx와 동일
  splashImage: {
    width: 150,
    height: 150,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
