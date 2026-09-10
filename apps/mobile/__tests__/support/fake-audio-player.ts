import type { ClickVoicePlayer } from "../../src/audio/clicker-engine";

/**
 * A fake `AudioPlayer` that models the semantics the real one actually has.
 *
 * The previous Jest mock was `{ play: jest.fn(), seekTo: jest.fn(), remove: jest.fn() }`. That mock is why the
 * every-other-press-is-silent bug shipped: it returned `undefined` from `seekTo` (the real one returns a promise)
 * and modelled no playback position at all, so an implementation that played from the end of the clip looked
 * identical to one that played from the start.
 *
 * This fake models the three behaviours that actually matter:
 *
 *   1. `play()` is **synchronous**; `seekTo()` is **asynchronous**, resolving a few milliseconds later, exactly
 *      like the native round trip it wraps.
 *   2. A one-shot leaves the position parked at `duration` when it finishes.
 *   3. `play()` on a player already at its end produces **no sound**. This is the crux: it is not an error and
 *      not a thrown exception, it is simply silence, which is why nothing caught it.
 *
 * ## Attributing sound to a press
 *
 * The contract is "one press, one audible click", so the interesting question is not how many playback events
 * occurred but **whether each individual press produced sound**. Those differ: seeking a player that is already
 * playing restarts the clip, which is one more playback event but not one more click the user perceives.
 *
 * So the recorder attributes every playback start back to the press that caused it, captured when `play()` or
 * `seekTo()` was *called* rather than when it resolved — a seek issued by one press can easily land during the
 * next one, and attributing it to the wrong press would quietly invalidate the whole suite.
 */

export interface AudioRecorder {
  playCalls: number;
  /** Playback start events, including restarts. Not the same as clicks heard — see the note above. */
  audibleStarts: number;
  /** `play()` calls swallowed because the player sat at the end of the clip. The bug's fingerprint. */
  silentAttempts: number;
  seekCalls: number;
  players: FakeAudioPlayer[];
  /** One entry per press, in order; true once that press has produced sound. */
  presses: boolean[];
  /** Index of the press currently being handled, used to attribute playback starts. */
  currentPress: number;
}

export function createRecorder(): AudioRecorder {
  return {
    playCalls: 0,
    audibleStarts: 0,
    silentAttempts: 0,
    seekCalls: 0,
    players: [],
    presses: [],
    currentPress: -1,
  };
}

/** Marks the start of a press. Call immediately before the code under test handles it. */
export function beginPress(recorder: AudioRecorder): void {
  recorder.presses.push(false);
  recorder.currentPress = recorder.presses.length - 1;
}

/** Presses that produced no sound at all. This is the number the reported defect made non-zero. */
export function silentPresses(recorder: AudioRecorder): number {
  return recorder.presses.filter((heard) => !heard).length;
}

/**
 * Clears a recorder in place.
 *
 * In place rather than by replacement because the shared Jest mock captures one recorder when the module factory
 * runs, and tests need to reset between cases without that reference going stale.
 */
export function resetRecorder(recorder: AudioRecorder): void {
  recorder.playCalls = 0;
  recorder.audibleStarts = 0;
  recorder.silentAttempts = 0;
  recorder.seekCalls = 0;
  recorder.players.length = 0;
  recorder.presses.length = 0;
  recorder.currentPress = -1;
}

/** Simulated native seek round trip. Non-zero on purpose: a zero-cost seek would hide the race being tested. */
export const SEEK_LATENCY_MS = 5;

export class FakeAudioPlayer implements ClickVoicePlayer {
  playing = false;
  currentTime = 0;
  duration: number;
  removed = false;

  private listeners: ((status: {
    didJustFinish: boolean;
    isLoaded: boolean;
  }) => void)[] = [];
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly recorder: AudioRecorder,
    clipMs = 45,
  ) {
    this.duration = clipMs / 1000;
    recorder.players.push(this);
  }

  play(): void {
    this.recorder.playCalls += 1;
    const press = this.recorder.currentPress;

    // Already sounding: the real player continues rather than layering a second copy on itself. The press is
    // still served — that voice is audibly mid-click on this press's behalf.
    if (this.playing) {
      this.attribute(press);
      return;
    }

    // The defect. Parked at the end of the item, so there is nothing left to play.
    if (this.currentTime >= this.duration) {
      this.recorder.silentAttempts += 1;
      return;
    }

    this.startPlayback(press);
  }

  seekTo(seconds: number): Promise<void> {
    this.recorder.seekCalls += 1;
    // Captured at call time, not at resolution time: this seek belongs to the press that issued it even if it
    // lands during a later one.
    const press = this.recorder.currentPress;
    return new Promise((resolve) => {
      setTimeout(() => {
        const wasPlaying = this.playing;
        this.currentTime = seconds;
        if (wasPlaying) {
          // Seeking mid-playback restarts the clip from the new position — audible, and the reason the engine's
          // recycle path is correct even when it lands on a voice that is still sounding.
          if (this.finishTimer) clearTimeout(this.finishTimer);
          this.playing = false;
          this.startPlayback(press);
        }
        resolve();
      }, SEEK_LATENCY_MS);
    });
  }

  remove(): void {
    this.removed = true;
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.listeners = [];
  }

  addListener(
    _event: "playbackStatusUpdate",
    listener: (status: { didJustFinish: boolean; isLoaded: boolean }) => void,
  ): { remove: () => void } {
    this.listeners.push(listener);
    return {
      remove: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }

  private attribute(press: number): void {
    if (press >= 0 && press < this.recorder.presses.length) {
      this.recorder.presses[press] = true;
    }
  }

  private startPlayback(press: number): void {
    this.recorder.audibleStarts += 1;
    this.attribute(press);
    this.playing = true;
    const remainingMs = (this.duration - this.currentTime) * 1000;
    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      this.playing = false;
      // Parks at the end, which is the state the next press has to cope with.
      this.currentTime = this.duration;
      for (const listener of this.listeners) {
        listener({ didJustFinish: true, isLoaded: true });
      }
    }, remainingMs);
  }
}
