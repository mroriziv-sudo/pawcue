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
  /** Playback position in seconds. The engine's belief about a voice is only ever as good as this. */
  readonly currentTime: number;
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

/**
 * How close to the start of the clip a player must be before a press will use it.
 *
 * A voice is only genuinely ready if its *player* is at the beginning — not merely if the engine believes so.
 * Measured on device, a stale belief is exactly how presses went silent: see the header note on start latency.
 */
const READY_POSITION_EPSILON_S = 0.001;

/** Re-check interval for a voice that was still sounding when its re-arm check came due. */
const REARM_RECHECK_MS = 25;

/**
 * Bound on those re-checks (~1s at the interval above). A player that never reports itself idle must not be able
 * to schedule timers forever; it simply stays unarmed, and the recycle path keeps it audible.
 */
const MAX_REARM_ATTEMPTS = 40;

/**
 * Development-only trace hook.
 *
 * The engine reports what it did rather than what it believes, so a diagnostic run can compare the two — the
 * whole class of bug here is the engine's belief about a voice diverging from the player's real position.
 * Production installs no sink, so this costs one null check per event.
 */
export interface ClickerTraceEvent {
  at: number;
  kind:
    | "play"
    | "recycle"
    | "rearm-seek"
    | "rearm-done"
    | "rearm-failed"
    | "finished"
    | "refresh";
  voice: number;
  positionBefore?: number;
  positionAfter?: number;
  playing?: boolean;
  armed?: boolean;
}

let traceSink: ((event: ClickerTraceEvent) => void) | null = null;

export function setClickerTraceSink(
  sink: ((event: ClickerTraceEvent) => void) | null,
): void {
  traceSink = sink;
}

function trace(event: ClickerTraceEvent): void {
  traceSink?.(event);
}

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
  /** Consecutive re-arm checks that found the voice still sounding. Bounded by MAX_REARM_ATTEMPTS. */
  attempts: number;
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
        attempts: 0,
        timer: null,
        subscription: null,
      };
      voice.subscription = player.addListener(
        "playbackStatusUpdate",
        (status) => {
          // The primary re-arm signal. The timer below is only a backstop for platforms or states where this does
          // not arrive: correctness must not depend on a status event we do not control.
          if (status.didJustFinish) {
            trace({
              at: Date.now(),
              kind: "finished",
              voice: i,
              positionAfter: player.currentTime,
            });
            /**
             * The player has just parked itself at the end of the clip, so any belief that this voice is ready is
             * now void — including one set by a re-arm that completed *during* this playback. Clearing the flag
             * before re-arming is what stops a finished voice from being handed out as ready.
             */
            voice.armed = false;
            this.rearmWhenIdle(voice);
          }
        },
      );
      this.voices.push(voice);
    }
  }

  get voiceCountLoaded(): number {
    return this.voices.length;
  }

  /** Development-only view of what each voice believes versus what its player reports. */
  get debugState() {
    return this.voices.map((voice, index) => ({
      index,
      armed: voice.armed,
      rearming: voice.rearming,
      playing: voice.player.playing,
      position: voice.player.currentTime,
      duration: voice.player.duration,
      timerPending: voice.timer !== null,
    }));
  }

  /** Index of the voice the last `click()` selected. Diagnostics only. */
  lastVoiceIndex = -1;

  /** True when at least one voice can play without waiting on a seek. Exposed for diagnostics and tests. */
  get hasArmedVoice(): boolean {
    return this.voices.some((voice) => voice.armed);
  }

  /**
   * Plays one click. Exactly one playback request per call — never zero, never two.
   */
  click(): ClickOutcome {
    if (this.voices.length === 0) return "unavailable";

    const voice = this.takeReadyVoice();
    if (voice) {
      const index = this.voices.indexOf(voice);
      this.lastVoiceIndex = index;
      const positionBefore = voice.player.currentTime;
      voice.armed = false;
      voice.attempts = 0;
      // The single synchronous call on the press path. Nothing is awaited before the sound starts.
      voice.player.play();
      trace({
        at: Date.now(),
        kind: "play",
        voice: index,
        positionBefore,
        playing: voice.player.playing,
      });
      this.scheduleRearm(voice);
      return "played";
    }

    // Slow path: every voice is mid-flight. Rewind one and play it when the seek lands. This is the only place a
    // seek precedes a play, and it is reachable only by pressing faster than the clip length across all six
    // voices — far beyond a human tap rate.
    const recycleIndex = this.cursor;
    const recycled = this.voices[this.cursor];
    this.cursor = (this.cursor + 1) % this.voices.length;
    if (!recycled) return "unavailable";
    this.lastVoiceIndex = recycleIndex;
    trace({
      at: Date.now(),
      kind: "recycle",
      voice: recycleIndex,
      positionBefore: recycled.player.currentTime,
      playing: recycled.player.playing,
    });
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
      this.rearmWhenIdle(voice);
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

  /**
   * Picks a voice that is genuinely able to make a sound.
   *
   * The `armed` flag is only a hint. What decides is the player: it must not be sounding, and it must be at the
   * start of the clip. Playing a player parked at its end is silent — no error, no exception — so a flag that has
   * drifted out of step with reality is indistinguishable from a working voice until the user hears nothing.
   * Any voice found in that state has its flag corrected and a re-arm kicked off, and the search moves on.
   */
  private takeReadyVoice(): Voice | null {
    for (let offset = 0; offset < this.voices.length; offset += 1) {
      const index = (this.cursor + offset) % this.voices.length;
      const voice = this.voices[index];
      if (!voice?.armed) continue;

      const player = voice.player;
      if (!player.playing && player.currentTime <= READY_POSITION_EPSILON_S) {
        this.cursor = (index + 1) % this.voices.length;
        return voice;
      }

      voice.armed = false;
      this.rearmWhenIdle(voice);
    }
    return null;
  }

  private scheduleRearm(voice: Voice, delayMs?: number): void {
    if (voice.timer) clearTimeout(voice.timer);
    const clipMs =
      voice.player.duration > 0
        ? voice.player.duration * 1000
        : FALLBACK_CLIP_MS;
    const delay = delayMs ?? clipMs + REARM_MARGIN_MS;
    voice.timer = setTimeout(() => {
      voice.timer = null;
      this.rearmWhenIdle(voice);
    }, delay);
  }

  /**
   * Returns a voice to the start of the clip, but only once it has actually stopped sounding.
   *
   * This is the heart of the fix. `play()` returns immediately, but AVPlayer takes a variable amount of time to
   * begin — around 80ms was measured on device, far more than any fixed margin could safely assume. A re-arm
   * scheduled from the moment `play()` was *called* therefore lands mid-clip, where it does two harmful things:
   * it restarts the click during its own attack, and it marks the voice ready before the playback it is meant to
   * follow has finished. When the clip then ends, the player parks at its end while the engine still believes the
   * voice is at zero — and every later press on that voice is silent.
   *
   * So the check is driven by what the player reports, not by elapsed time: if it is still sounding, look again
   * shortly rather than seeking.
   */
  private rearmWhenIdle(voice: Voice): void {
    if (voice.rearming) return;

    if (voice.player.playing) {
      voice.attempts += 1;
      if (voice.attempts <= MAX_REARM_ATTEMPTS) {
        this.scheduleRearm(voice, REARM_RECHECK_MS);
      }
      return;
    }

    voice.attempts = 0;

    // Already at the start — nothing to seek, so the voice is ready immediately.
    if (voice.player.currentTime <= READY_POSITION_EPSILON_S) {
      voice.armed = true;
      return;
    }

    this.seekToStart(voice);
  }

  private seekToStart(voice: Voice): void {
    if (voice.armed || voice.rearming) return;
    const index = this.voices.indexOf(voice);
    voice.rearming = true;
    trace({
      at: Date.now(),
      kind: "rearm-seek",
      voice: index,
      positionBefore: voice.player.currentTime,
      playing: voice.player.playing,
    });
    voice.player
      .seekTo(0)
      .then(() => {
        voice.armed = true;
        trace({
          at: Date.now(),
          kind: "rearm-done",
          voice: index,
          // The decisive measurement: where the player actually is once the seek reports completion.
          positionAfter: voice.player.currentTime,
          playing: voice.player.playing,
          armed: true,
        });
      })
      .catch(() => {
        trace({ at: Date.now(), kind: "rearm-failed", voice: index });
        // Left unarmed on purpose. An unarmed voice is still usable through the recycle path, which seeks again —
        // so a transient seek failure degrades latency, never audibility.
      })
      .finally(() => {
        voice.rearming = false;
      });
  }
}
