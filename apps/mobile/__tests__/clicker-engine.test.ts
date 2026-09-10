import { ClickerEngine, CLICK_VOICE_COUNT } from "../src/audio/clicker-engine";
import {
  beginPress,
  createRecorder,
  FakeAudioPlayer,
  silentPresses,
  type AudioRecorder,
} from "./support/fake-audio-player";

/**
 * Regression coverage for the clicker's playback reliability.
 *
 * The contract under test is deliberately blunt: **one intentional press produces exactly one audible click.**
 * Every case below asserts that no press was silent, rather than counting `play()` calls, because the defect this
 * replaced issued exactly the right number of `play()` calls and half of them made no sound. Counting requests
 * would have passed against the bug.
 */

const CLIP_MS = 45;
/** Comfortably past clip length + the engine's re-arm margin, so a voice is definitely back at position 0. */
const SETTLE_MS = 200;

let recorder: AudioRecorder;

function newEngine(voices = CLICK_VOICE_COUNT): ClickerEngine {
  const engine = new ClickerEngine(
    () => new FakeAudioPlayer(recorder, CLIP_MS),
    voices,
  );
  engine.load();
  return engine;
}

/** One user press: opens a press window for attribution, then clicks. */
function press(engine: ClickerEngine) {
  beginPress(recorder);
  return engine.click();
}

/** Presses `count` times, waiting `gapMs` between each. */
async function pressRepeatedly(
  engine: ClickerEngine,
  count: number,
  gapMs: number,
) {
  for (let i = 0; i < count; i += 1) {
    press(engine);
    await jest.advanceTimersByTimeAsync(gapMs);
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  recorder = createRecorder();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the historical defect", () => {
  /**
   * Reproduces the original implementation against the same fake.
   *
   * This test exists for two reasons: it documents the bug precisely, and it proves the fake is faithful. If the
   * fake did not model a player parked at the end of its clip, this would pass and be worthless.
   */
  it("alternates silent presses when the reset races the playback (pre-fix behaviour)", async () => {
    const player = new FakeAudioPlayer(recorder, CLIP_MS);

    const brokenClick = () => {
      void player.seekTo(0); // asynchronous — lands after play()
      player.play(); // synchronous — runs immediately
    };

    for (let i = 0; i < 6; i += 1) {
      beginPress(recorder);
      brokenClick();
      await jest.advanceTimersByTimeAsync(400);
    }

    // Every press asked for playback...
    expect(recorder.playCalls).toBe(6);
    // ...but half were swallowed because the player sat at the end of the clip.
    expect(recorder.silentAttempts).toBe(3);
    // The reported symptom, reproduced exactly: every other press made no sound.
    expect(silentPresses(recorder)).toBe(3);
    expect(recorder.presses).toEqual([true, false, true, false, true, false]);
  });
});

describe("one press, one audible click", () => {
  it("plays on a single press", async () => {
    const engine = newEngine();

    expect(press(engine)).toBe("played");
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.presses).toEqual([true]);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("plays on 3 presses at a normal pace", async () => {
    const engine = newEngine();

    await pressRepeatedly(engine, 3, 400);

    expect(recorder.presses).toHaveLength(3);
    expect(silentPresses(recorder)).toBe(0);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("plays on 10 presses at a normal pace", async () => {
    const engine = newEngine();

    await pressRepeatedly(engine, 10, 400);

    expect(recorder.presses).toHaveLength(10);
    expect(silentPresses(recorder)).toBe(0);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("plays on 10 rapid presses", async () => {
    const engine = newEngine();

    // 30ms apart — faster than the 45ms clip, so presses genuinely overlap.
    await pressRepeatedly(engine, 10, 30);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.presses).toHaveLength(10);
    expect(silentPresses(recorder)).toBe(0);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("plays on a burst pressed faster than the voice pool can recycle", async () => {
    const engine = newEngine();

    // 20 presses 5ms apart exhausts the pool and forces the recycle path. Still one click per press.
    await pressRepeatedly(engine, 20, 5);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.presses).toHaveLength(20);
    expect(silentPresses(recorder)).toBe(0);
    expect(recorder.silentAttempts).toBe(0);
  });
});

describe("no artificial rate limiting", () => {
  it("issues a playback request for every press, with no debounce or throttle", async () => {
    const engine = newEngine();

    await pressRepeatedly(engine, 12, 10);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.playCalls + recorder.seekCalls).toBeGreaterThanOrEqual(12);
    expect(recorder.presses).toHaveLength(12);
    expect(silentPresses(recorder)).toBe(0);
  });

  it("never awaits a seek on the press path while an armed voice exists", () => {
    const engine = newEngine();

    press(engine);

    // The whole point of the fix: pressing costs one synchronous play() and no seek at all.
    expect(recorder.playCalls).toBe(1);
    expect(recorder.seekCalls).toBe(0);
  });
});

describe("voice recycling", () => {
  it("spreads consecutive presses across different voices so they can overlap", () => {
    const engine = newEngine();

    press(engine);
    press(engine);
    press(engine);

    const playing = recorder.players.filter((p) => p.playing);
    expect(playing).toHaveLength(3);
  });

  it("returns a voice to the start of the clip once it has finished", async () => {
    const engine = newEngine(1);

    press(engine);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.players[0]?.currentTime).toBe(0);
    expect(engine.hasArmedVoice).toBe(true);
  });

  it("stays audible on a single voice pressed repeatedly", async () => {
    // The narrowest possible pool is where the original bug was most visible.
    const engine = newEngine(1);

    await pressRepeatedly(engine, 8, 400);

    expect(recorder.presses).toHaveLength(8);
    expect(silentPresses(recorder)).toBe(0);
    expect(recorder.silentAttempts).toBe(0);
  });
});

describe("app lifecycle", () => {
  it("plays after background → foreground", async () => {
    const engine = newEngine();

    press(engine);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    /**
     * Simulates the audio session being taken away while backgrounded: every player is left parked at the end of
     * its clip, while the engine still believes they are armed and ready at position 0. This caught a real bug —
     * `refresh()` originally skipped voices it thought were already armed, which is exactly the belief that
     * backgrounding invalidates, so the first press after returning was silent.
     */
    for (const player of recorder.players) player.currentTime = player.duration;

    engine.refresh();
    await jest.advanceTimersByTimeAsync(50);

    press(engine);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.presses).toEqual([true, true]);
    expect(recorder.silentAttempts).toBe(0);
  });

  it("recovers even if the status event never arrives", async () => {
    const engine = newEngine(1);
    // Silence the status listeners so `didJustFinish` can never fire, leaving only the timer backstop.
    recorder.players[0]?.remove();

    press(engine);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);
    press(engine);
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    expect(recorder.presses).toEqual([true, true]);
    expect(recorder.silentAttempts).toBe(0);
  });
});

describe("teardown", () => {
  it("releases every player on dispose", () => {
    const engine = newEngine();
    engine.dispose();

    expect(recorder.players).toHaveLength(CLICK_VOICE_COUNT);
    expect(recorder.players.every((p) => p.removed)).toBe(true);
    expect(engine.click()).toBe("unavailable");
  });

  it("does not leak voices when reloaded for a different sound", () => {
    const engine = newEngine();
    const first = [...recorder.players];

    engine.load();

    expect(first.every((p) => p.removed)).toBe(true);
    expect(engine.voiceCountLoaded).toBe(CLICK_VOICE_COUNT);
  });
});
