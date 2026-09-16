import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing } from "react-native";
import type { AppTheme } from "@pawcue/ui";

/**
 * How the dog moves — the numbers from docs/architecture/phase-11-the-dog-at-work.md, in one place.
 *
 * Two idle loops and two reactions, and nothing else. The idle loops run only on a drawn body pose of at least
 * `minSize` points while the app is in the foreground; a bust, a photo, a row and the tab bar never move. Under
 * Reduce Motion the loops are off and the reactions reduce to the expression change alone, which the avatar's
 * cross-fade already carries.
 */
export const DOG_MOTION = {
  /** Below this the dog is a still drawing: nothing loops, nothing reacts beyond the expression. */
  minSize: 120,
  /** Every 4 to 7 seconds the eyes close for 120ms. State, not animation: two shapes redraw. */
  blink: { minGap: 4000, maxGap: 7000, closed: 120 },
  /** The whole dog at 1.5% scale over 3 seconds, ease in and out, continuous. Native driver. */
  breath: { scale: 1.015, period: 3000 },
  /** A counted repetition: a 400ms wag of the tail about its root, and the happy face for 700ms. */
  wag: { duration: 400, degrees: 14, happyFor: 700 },
  /** Completion: one 300ms bounce of the whole dog, once, when the screen arrives. Native driver. */
  bounce: { duration: 300, rise: 8 },
} as const;

/** What the dog is reacting to. The `key` changes every time, so the same reaction can fire twice in a row. */
export interface DogReaction {
  kind: "rep" | "complete";
  key: number;
}

export interface DogMotion {
  /** True while the eyes are closed for a blink. */
  blink: boolean;
  /** True while a rep is being celebrated: the caller's expression gives way to `happy`. */
  celebrating: boolean;
  /** Scale on the whole avatar, 1 at rest. Native driver. */
  breath: Animated.Value;
  /** Vertical offset of the whole avatar, 0 at rest. Native driver. */
  bounce: Animated.Value;
  /** The tail's swing, −1 to 1, 0 at rest. JS driver, because it turns a group inside the SVG. */
  wag: Animated.Value;
}

/** iOS reports `inactive` on the way to the background and during system overlays; both are "not on screen". */
function isForeground(state: unknown): boolean {
  return state !== "background" && state !== "inactive";
}

function blinkGap(): number {
  const { minGap, maxGap } = DOG_MOTION.blink;
  return minGap + Math.random() * (maxGap - minGap);
}

/**
 * The idle loops and the reactions for one avatar.
 *
 * `enabled` is the avatar's own verdict — a drawn body pose, at least `minSize`, Reduce Motion off. The hook adds
 * the foreground check on top: both loops stop when the app leaves the foreground and start again on return,
 * and both stop on unmount. `reduceMotion` is passed separately so that a rep reaction still changes the
 * expression when nothing may move.
 */
export function useDogMotion({
  enabled,
  reduceMotion,
  reaction,
  theme,
}: {
  enabled: boolean;
  reduceMotion: boolean;
  reaction: DogReaction | null | undefined;
  theme: AppTheme;
}): DogMotion {
  const breath = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const wag = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [foreground, setForeground] = useState(() =>
    isForeground(AppState.currentState),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(isForeground(state));
    });
    return () => subscription.remove();
  }, []);

  const idle = enabled && foreground;

  // The blink: a timer that closes the eyes for 120ms every 4 to 7 seconds. Cleared, and the eyes opened, the
  // moment the loop is no longer wanted.
  useEffect(() => {
    if (!idle) {
      setBlink(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const open = () => {
      setBlink(false);
      timer = setTimeout(close, blinkGap());
    };
    const close = () => {
      setBlink(true);
      timer = setTimeout(open, DOG_MOTION.blink.closed);
    };
    timer = setTimeout(close, blinkGap());
    return () => {
      clearTimeout(timer);
      setBlink(false);
    };
  }, [idle]);

  // Breathing: a native-driver loop, so it costs the JS thread nothing while it runs.
  useEffect(() => {
    if (!idle) return;
    const half = DOG_MOTION.breath.period / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: DOG_MOTION.breath.scale,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      breath.setValue(1);
    };
  }, [idle, breath]);

  // Reactions. A reaction present at mount fires — that is how the completion screen bounces on arrival — and
  // after that only a new key fires again.
  const lastKey = useRef<number | null>(null);
  useEffect(() => {
    if (!reaction || reaction.key === lastKey.current) return;
    lastKey.current = reaction.key;

    if (reaction.kind === "rep") {
      // The happy face lands whatever else may move: under Reduce Motion it is the whole reaction.
      setCelebrating(true);
      const happy = setTimeout(
        () => setCelebrating(false),
        DOG_MOTION.wag.happyFor,
      );
      let burst: Animated.CompositeAnimation | null = null;
      if (enabled && !reduceMotion) {
        burst = wagBurst(wag, theme);
        burst.start(() => wag.setValue(0));
      }
      return () => {
        clearTimeout(happy);
        setCelebrating(false);
        burst?.stop();
        wag.setValue(0);
      };
    }

    if (enabled && !reduceMotion) {
      const hop = bounceOnce(bounce);
      hop.start(() => bounce.setValue(0));
      return () => {
        hop.stop();
        bounce.setValue(0);
      };
    }
    return undefined;
  }, [reaction, enabled, reduceMotion, wag, bounce, theme]);

  return { blink, celebrating, breath, bounce, wag };
}

/**
 * Four swings in 400ms — out, across, back, home — on the JS thread, because the value turns a group inside the
 * SVG. A burst, never a loop. The `responsive` spring would settle the last swing but not inside the budget:
 * with React Native's rest thresholds it needs another half second, so the return is timed too.
 */
function wagBurst(
  wag: Animated.Value,
  theme: AppTheme,
): Animated.CompositeAnimation {
  const [out, across, back, home] = [90, 120, 100, 90];
  const [x1, y1, x2, y2] = theme.easing.standard;
  const standard = Easing.bezier(x1, y1, x2, y2);
  return Animated.sequence([
    Animated.timing(wag, {
      toValue: 1,
      duration: out,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }),
    Animated.timing(wag, {
      toValue: -1,
      duration: across,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }),
    Animated.timing(wag, {
      toValue: 0.5,
      duration: back,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }),
    Animated.timing(wag, {
      toValue: 0,
      duration: home,
      easing: standard,
      useNativeDriver: false,
    }),
  ]);
}

/** Up quickly, down a little slower: 300ms, once. */
function bounceOnce(bounce: Animated.Value): Animated.CompositeAnimation {
  const { duration, rise } = DOG_MOTION.bounce;
  return Animated.sequence([
    Animated.timing(bounce, {
      toValue: -rise,
      duration: duration * 0.4,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }),
    Animated.timing(bounce, {
      toValue: 0,
      duration: duration * 0.6,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }),
  ]);
}
