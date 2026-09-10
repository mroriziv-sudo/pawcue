/**
 * The clicker's playback engine.
 *
 * ## The defect this exists to fix
 *
 * The first implementation did this on every press:
 *
 * ```ts
 * void player.seekTo(0);   // Promise<void> — asynchronous
 * player.play();           // void         — synchronous, runs immediately
 * ```
 *
 * `AudioPlayer.play()` is synchronous but `AudioPlayer.seekTo()` returns a promise, because it is a round trip to
 * a native `seek(to:completionHandler:)`. So `play()` always ran *before* the seek landed.
 *
 * A one-shot sound leaves its player parked at the end of the item once it finishes. So the presses alternated:
 *
 *   press 1 — position 0        → `play()` plays the clip. It ends; position is now at `duration`.
 *   press 2 — position=duration → `play()` is a no-op, because the item is already at its end. **Silence.**
 *                                 The seek then lands, returning the position to 0.
 *   press 3 — position 0        → plays.
 *   press 4 — position=duration → silent.
 *
 * That is exactly the "every other press is silent" pattern reported from the device. The reset was racing the
 * playback it was supposed to enable, and it lost every time.
 *
 * ## The fix
 *
 * Two changes, neither of which delays a press:
 *
 * 1. **Reset after playback, never before it.** A voice is returned to position 0 once its clip has finished, so
 *    it is already at 0 by the time it is needed again. Pressing costs exactly one synchronous `play()` — strictly
 *    less work than before, so latency goes down rather than up.
 *
 * 2. **A pool of voices.** One press takes the next armed voice. Rapid presses land on different voices, so they
 *    overlap naturally instead of one press cutting off — or being swallowed by — the press before it.
 *
 * There is deliberately no debounce, no throttle and no delay on the press path: every press plays.
 */

/** The part of `expo-audio`'s `AudioPlayer` this engine uses. Narrow on purpose, so tests can supply a fake. */
export interface ClickVoicePlayer {
  play(): void;
  seekTo(seconds: number): Promise<void>;
  remove(): void;
  readonly playing: boolean;
  readonly duration: number;
  addListener(
    event: "playbackStatusUpdate",
    listener: (status: { didJustFinish: boolean; isLoaded: boolean }) => void,
  ): { remove: () => void };
}

/**
 * Six voices.
 *
 * The clip is 38–55ms, so at a brisk human tapping rate (~8/second) barely two voices are ever in flight. Six is
 * cheap — a preloaded 45ms mono clip is a few KB of audio — and leaves enough headroom that the slow path below
 * is unreachable in practice.
 */
export const CLICK_VOICE_COUNT = 6;

/** Grace period added to the clip length before a voice is re-armed, covering scheduling jitter. */
export const REARM_MARGIN_MS = 40;

/** Used until the player reports a real duration. Above the longest candidate (55ms) so it is never too eager. */
const FALLBACK_CLIP_MS = 70;

export type ClickOutcome =
  /** An armed voice played immediately. The normal path. */
  | "played"
  /** Every voice was still in flight, so one was rewound and replayed. Correct, marginally slower. */
  | "recycled"
  /** No voices exist — audio failed to load. The press still counts; it is simply silent. */
  | "unavailable";

interface Voice {
  player: ClickVoicePlayer;
  /** True when the player sits at position 0 and can be played with a single synchronous call. */
  armed: boolean;
  /** Guards against two re-arm paths (status event and timer) issuing overlapping seeks. */
  rearming: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  subscription: { remove: () => void } | null;
}

export class ClickerEngine {
  private voices: Voice[] = [];
  private cursor = 0;

  constructor(
    private readonly createPlayer: () => ClickVoicePlayer,
    private readonly voiceCount: number = CLICK_VOICE_COUNT,
  ) {}

  /** Builds the voice pool. Safe to call again; the previous pool is torn down first. */
  load(): void {
    this.dispose();
    for (let i = 0; i < this.voiceCount; i += 1) {
      const player = this.createPlayer();
      const voice: Voice = {
        player,
        // A freshly created player sits at position 0, so it is armed from the start. The asset is bundled and
        // preloaded before the screen is interactive, so there is no window where this is optimistic in practice.
        armed: true,
        rearming: false,
        timer: null,
        subscription: null,
      };
      voice.subscription = player.addListener(
        "playbackStatusUpdate",
        (status) => {
          // The primary re-arm signal. The timer below is only a backstop for platforms or states where this does
          // not arrive: correctness must not depend on a status event we do not control.
          if (status.didJustFinish) this.rearm(voice);
        },
      );
      this.voices.push(voice);
    }
  }

  get voiceCountLoaded(): number {
    return this.voices.length;
  }

  /** True when at least one voice can play without waiting on a seek. Exposed for diagnostics and tests. */
  get hasArmedVoice(): boolean {
    return this.voices.some((voice) => voice.armed);
  }

  /**
   * Plays one click. Exactly one playback request per call — never zero, never two.
   */
  click(): ClickOutcome {
    if (this.voices.length === 0) return "unavailable";

    const voice = this.takeArmedVoice();
    if (voice) {
      voice.armed = false;
      // The single synchronous call on the press path. Nothing is awaited before the sound starts.
      voice.player.play();
      this.scheduleRearm(voice);
      return "played";
    }

    // Slow path: every voice is mid-flight. Rewind one and play it when the seek lands. This is the only place a
    // seek precedes a play, and it is reachable only by pressing faster than the clip length across all six
    // voices — far beyond a human tap rate.
    const recycled = this.voices[this.cursor];
    this.cursor = (this.cursor + 1) % this.voices.length;
    if (!recycled) return "unavailable";
    recycled.armed = false;
    void recycled.player
      .seekTo(0)
      .then(() => {
        recycled.player.play();
        this.scheduleRearm(recycled);
      })
      .catch(() => {
        /* A failed seek leaves the voice unarmed; the next press re-tries it through this same path. */
      });
    return "recycled";
  }

  /**
   * Re-arms every idle voice.
   *
   * Called when the app returns to the foreground: iOS can tear down or interrupt the audio session while
   * backgrounded, which can leave a player's position somewhere other than where the engine believes it is.
   */
  refresh(): void {
    for (const voice of this.voices) {
      if (voice.player.playing) continue;
      // Deliberately discards the `armed` flag first. Whether a voice is at position 0 is the engine's *belief*,
      // and a suspended audio session is precisely the case where that belief can be wrong — a voice can be left
      // parked mid-clip while still flagged armed, which would make the next press silent. Re-seeking an idle
      // voice that was already at 0 costs nothing, so the safe direction is to distrust the flag.
      voice.armed = false;
      this.rearm(voice);
    }
  }

  dispose(): void {
    for (const voice of this.voices) {
      if (voice.timer) clearTimeout(voice.timer);
      voice.subscription?.remove();
      voice.player.remove();
    }
    this.voices = [];
    this.cursor = 0;
  }

  private takeArmedVoice(): Voice | null {
    for (let offset = 0; offset < this.voices.length; offset += 1) {
      const index = (this.cursor + offset) % this.voices.length;
      const voice = this.voices[index];
      if (voice?.armed) {
        this.cursor = (index + 1) % this.voices.length;
        return voice;
      }
    }
    return null;
  }

  private scheduleRearm(voice: Voice): void {
    if (voice.timer) clearTimeout(voice.timer);
    const clipMs =
      voice.player.duration > 0
        ? voice.player.duration * 1000
        : FALLBACK_CLIP_MS;
    voice.timer = setTimeout(() => {
      voice.timer = null;
      this.rearm(voice);
    }, clipMs + REARM_MARGIN_MS);
  }

  private rearm(voice: Voice): void {
    if (voice.armed || voice.rearming) return;
    voice.rearming = true;
    voice.player
      .seekTo(0)
      .then(() => {
        voice.armed = true;
      })
      .catch(() => {
        // Left unarmed on purpose. An unarmed voice is still usable through the recycle path, which seeks again —
        // so a transient seek failure degrades latency, never audibility.
      })
      .finally(() => {
        voice.rearming = false;
      });
  }
}
