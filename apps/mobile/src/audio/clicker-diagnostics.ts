import { setClickerTraceSink, type ClickerTraceEvent } from "./clicker-engine";
import {
  engineForDiagnostics,
  ensureClicker,
  playClick,
} from "./clicker-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSettingsStore } from "../state/settings-store";

/**
 * Development-only clicker diagnostics.
 *
 * Automated UI tapping is not available in this environment, so reproducing a press-count-dependent audio bug by
 * hand is slow and imprecise. This drives the **real** engine against **real** `expo-audio` players on the device
 * and records, for every press, what the engine believed versus what the player actually reported.
 *
 * That distinction is the whole point: the failure mode being chased is a voice the engine considers armed and
 * ready while its player is really still parked at the end of the clip. Only a side-by-side of belief and reality
 * can tell those apart.
 *
 * Exposed on `globalThis.__clickerDiag` under `__DEV__` so it can be invoked from the React Native debugger.
 */

export interface PressRecord {
  press: number;
  voice: number;
  outcome: string;
  /** Player position at the moment `play()` was called. Non-zero here means the click will be silent. */
  positionAtPlay: number;
  /** Sampled a few ms later. If this has not advanced past `positionAtPlay`, nothing is sounding. */
  positionAfter: number;
  playingAfter: boolean;
  /** `playing` read synchronously after `play()` returned. */
  playingImmediately: boolean;
  audible: boolean;
  armedVoicesBefore: number;
}

export interface DiagnosticRun {
  label: string;
  presses: number;
  intervalMs: number;
  records: PressRecord[];
  silentPresses: number[];
  firstSilentPress: number | null;
  trace: ClickerTraceEvent[];
  finalState: unknown;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `presses` presses `intervalMs` apart, sampling the selected voice shortly after each one.
 *
 * A click is counted audible only if the player's position actually advanced, or it is still reporting as
 * playing. Asking the engine whether it played would just re-assert its own belief.
 */
export async function runClickerDiagnostic(
  label: string,
  presses: number,
  intervalMs: number,
): Promise<DiagnosticRun> {
  const trace: ClickerTraceEvent[] = [];
  setClickerTraceSink((event) => trace.push(event));

  const soundId = useSettingsStore.getState().clickSoundId;
  ensureClicker(soundId);
  const engine = engineForDiagnostics();
  const records: PressRecord[] = [];

  // Settle first, so the run measures steady-state behaviour rather than start-up.
  await wait(300);

  for (let press = 1; press <= presses; press += 1) {
    const before = engine?.debugState ?? [];
    const armedVoicesBefore = before.filter((voice) => voice.armed).length;

    const outcome = playClick();
    const voice = engine?.lastVoiceIndex ?? -1;
    const state = engine?.debugState ?? [];
    const positionAtPlay = state[voice]?.position ?? -1;
    const playingImmediately = state[voice]?.playing ?? false;

    // Long enough for playback to have measurably advanced, short enough not to distort the pacing.
    const sample = Math.min(15, Math.max(1, intervalMs - 1));
    await wait(sample);

    const after = engine?.debugState ?? [];
    const positionAfter = after[voice]?.position ?? -1;
    const playingAfter = after[voice]?.playing ?? false;

    records.push({
      press,
      voice,
      outcome,
      positionAtPlay,
      positionAfter,
      playingAfter,
      audible: playingAfter || positionAfter > positionAtPlay,
      playingImmediately,
      armedVoicesBefore,
    });

    const remaining = intervalMs - sample;
    if (remaining > 0) await wait(remaining);
  }

  await wait(300);
  setClickerTraceSink(null);

  const silentPresses = records.filter((r) => !r.audible).map((r) => r.press);

  return {
    label,
    presses,
    intervalMs,
    records,
    silentPresses,
    firstSilentPress: silentPresses[0] ?? null,
    trace,
    finalState: engine?.debugState ?? [],
  };
}

/** Condensed result, so a run can be read at a glance from the debugger. */
export function summarise(run: DiagnosticRun) {
  return {
    label: run.label,
    presses: run.presses,
    intervalMs: run.intervalMs,
    silent: run.silentPresses.length,
    firstSilentPress: run.firstSilentPress,
    silentPresses: run.silentPresses.slice(0, 20),
    voiceSequence: run.records.map((r) => r.voice).join(","),
    positionsAtPlay: run.records.map((r) =>
      Number(r.positionAtPlay.toFixed(4)),
    ),
    rearmDone: run.trace
      .filter((e) => e.kind === "rearm-done")
      .map((e) => ({ voice: e.voice, positionAfter: e.positionAfter })),
    finishedEvents: run.trace.filter((e) => e.kind === "finished").length,
    rearmSeeks: run.trace.filter((e) => e.kind === "rearm-seek").length,
  };
}

/** Where a run's summary is written so it can be read back off-device. Development only. */
export const DIAGNOSTIC_RESULT_KEY = "pawcue.dev.clickerDiagnostic";

/**
 * Runs the standard reliability sweep and persists the summaries.
 *
 * The intervals span the reported conditions: unhurried presses, a brisk tap, and a burst — each long enough to
 * cross several complete pool cycles, since the reported failure appears around the seventh press with a
 * six-voice pool.
 */
export async function runStandardSweep(): Promise<unknown> {
  const summaries: unknown[] = [];
  for (const [label, presses, interval] of [
    ["20 normal", 20, 400],
    ["20 rapid", 20, 60],
    ["50 normal", 50, 250],
    ["30 varied", 30, 150],
    ["12 slow", 12, 900],
  ] as const) {
    const run = await runClickerDiagnostic(label, presses, interval);
    summaries.push(summarise(run));
    await AsyncStorage.setItem(
      DIAGNOSTIC_RESULT_KEY,
      JSON.stringify({ sweep: summaries }),
    );
  }
  return summaries;
}

export function installClickerDiagnostics(): void {
  if (!__DEV__) return;
  (
    globalThis as typeof globalThis & { __clickerDiag?: unknown }
  ).__clickerDiag = { runClickerDiagnostic, summarise, runStandardSweep };

  /**
   * Opt-in auto-run, for reproducing a press-count-dependent fault without UI automation.
   *
   * `EXPO_PUBLIC_CLICKER_DIAG=1 pnpm --filter @pawcue/mobile start` runs the sweep shortly after launch and writes
   * the summaries to AsyncStorage, which can be read off a simulator from the app container. Read as a literal
   * member expression because Metro inlines `process.env.EXPO_PUBLIC_*` by static text substitution — a computed
   * lookup silently yields undefined in a bundle.
   */
  if (process.env.EXPO_PUBLIC_CLICKER_DIAG === "1") {
    setTimeout(() => {
      void runStandardSweep();
    }, 1500);
  }
}
