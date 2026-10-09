// Shared motion: press feedback for every tappable, and a soft entrance for content that appears.
// Built on RN Animated with the native driver: only transform and opacity animate.
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

// Strong ease-out: starts fast, so the UI answers the finger immediately
export const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

// Reduced motion: keep opacity, drop movement
let reduce = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduce = v));
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduce = v));

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

// Drop-in Pressable that scales to 0.97 while held (opacity dip under reduced motion)
export function Pressable({ style, onPressIn, onPressOut, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const [p] = useState(() => new Animated.Value(0));
  const to = (v: number, ms: number) => Animated.timing(p, { toValue: v, duration: ms, easing: easeOut, useNativeDriver: true }).start();
  const feedback = reduce
    ? { opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }
    : { transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }] };
  return (
    <AnimatedPressable
      {...rest}
      style={[style, feedback]}
      onPressIn={(e) => {
        to(1, 100);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(0, 200); // release a touch slower than press, still snappy
        onPressOut?.(e);
      }}
    />
  );
}

// Fades and lifts children in on mount. Re-key it to replay (e.g. key={tab}).
// pop: grows from 0.85 instead of lifting, for the icon of a full-screen notice
export function FadeIn({ children, style, delay = 0, pop = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; pop?: boolean }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 220, delay, easing: easeOut, useNativeDriver: true }).start();
  }, [v, delay]);
  const lift = reduce
    ? []
    : pop
      ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }]
      : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }];
  return <Animated.View style={[style, { opacity: v, transform: lift }]}>{children}</Animated.View>;
}
