import { create } from "zustand";
import {
  abandonSession,
  completeCurrentStep,
  logRepetition,
  openTroubleshooting,
  recordClickerPress,
  resolveTroubleshooting,
  restoreSession,
  startSession,
  undoRepetition,
  type EngineContext,
  type LessonContent,
  type TrainingSessionState,
  type TransitionFailure,
} from "@pawcue/domain";
import { trainingSessionStateSchema } from "@pawcue/domain";
import { appStorage, STORAGE_KEYS } from "../lib/storage";
import { uuidV4 } from "../lib/uuid";
import { useTrainingLogStore } from "./training-log-store";

/**
 * The React-facing wrapper around the session engine.
 *
 * This store owns exactly two things the engine cannot: **where the state is kept** and **when it is written
 * down**. Every rule about what a session may do lives in `@pawcue/domain`'s engine, and this file only forwards
 * to it — which is what keeps session logic out of screens.
 *
 * ## Three kinds of state, deliberately separated
 *
 *  - **Local transient** — which troubleshooting sheet is open, whether content is loading. Held in the screens,
 *    never persisted; reopening a lesson should not reopen a help sheet.
 *  - **Persisted local** — the `TrainingSessionState` below. Written to AsyncStorage on every transition so a
 *    process restart resumes mid-lesson. This is the tier Phase 3 actually uses.
 *  - **Server-backed** — `training_sessions` and `session_events` rows. **Not written yet**: `dog_id` is NOT NULL
 *    and a guest has no dog until onboarding. The engine already produces the event log those rows need, and
 *    `toTrainingSessionRow` marks the boundary, so the flush is additive when a dog exists.
 */

const engineContext: EngineContext = {
  now: () => new Date().toISOString(),
  newId: uuidV4,
};

export interface SessionStoreState {
  session: TrainingSessionState | null;
  /** Set when a transition is refused, so a screen can explain rather than silently ignore the tap. */
  lastFailure: TransitionFailure | null;
  hydrated: boolean;

  /**
   * Reads the persisted session into memory at boot, without a lesson to resume it into.
   *
   * Exists so surfaces that are not the training screen — Today's "pick up where you left off" — can see that
   * unfinished work exists. Before this, the persisted session was only ever read by `resumeOrBegin`, so after a
   * cold launch the store was empty until a session screen mounted, and the resume card had nothing to show
   * precisely when it mattered most.
   */
  hydrate: () => Promise<void>;
  begin: (content: LessonContent) => void;
  /** Resumes a persisted session for this lesson if one is still valid; otherwise starts fresh. */
  resumeOrBegin: (content: LessonContent) => Promise<void>;
  click: (content: LessonContent) => void;
  addRepetition: (content: LessonContent) => void;
  removeRepetition: (content: LessonContent) => void;
  completeStep: (content: LessonContent, stepId: string) => void;
  viewTroubleshooting: (content: LessonContent, optionId: string) => void;
  closeTroubleshooting: (content: LessonContent, optionId: string) => void;
  abandon: (content: LessonContent) => void;
  clear: () => Promise<void>;
}

/**
 * Records a displaced in-progress session as abandoned.
 *
 * This is the moment a session genuinely ends without finishing: the stored one cannot be resumed into the lesson
 * now being opened, so the user has moved on. Nothing else in the app ever transitioned a session to `abandoned`,
 * which is why the planner's highest-priority rule could not fire from real data.
 *
 * Two guards keep the history honest. A session that is already completed or abandoned is left alone — it has a
 * record already. A session with no events is dropped rather than recorded: opening a lesson screen and leaving
 * is not unfinished work, and logging it would make the planner nag about something the user never started.
 */
async function archiveDisplacedSession(stored: unknown): Promise<void> {
  const parsed = trainingSessionStateSchema.safeParse(stored);
  if (!parsed.success) return;

  const state = parsed.data;
  if (state.status !== "in_progress") return;
  if (state.events.length === 0) return;

  const result = abandonSession(state, engineContext);
  if (result.ok) {
    await useTrainingLogStore.getState().record(result.state);
  }
}

async function persist(session: TrainingSessionState | null): Promise<void> {
  try {
    if (!session) {
      await appStorage.removeItem(STORAGE_KEYS.activeSession);
      return;
    }
    await appStorage.setItem(
      STORAGE_KEYS.activeSession,
      JSON.stringify(session),
    );
  } catch {
    /* Persistence is a resilience feature, not a precondition — a failed write must not interrupt training. */
  }
}

/**
 * The one paused lesson, if there is one.
 *
 * The store holds exactly one in-progress session, and it is the same one the training screen would resume.
 * Every screen that says a lesson is paused — Today's resume button and trail row, the Dog tab's journey, Train's
 * catalogue and the lesson overview's button — asks this one question, so a paused Sit reads one way everywhere
 * (phase-10-native-acceptance.md, finding 2). The server-derived lesson status is a different, later fact: it
 * says "unfinished" only once a session has been abandoned and logged.
 */
export function resumableSession(
  session: TrainingSessionState | null,
): TrainingSessionState | null {
  return session?.status === "in_progress" ? session : null;
}

export const useSessionStore = create<SessionStoreState>((set, get) => {
  /**
   * Applies an engine transition.
   *
   * Every action funnels through here so that persistence and failure reporting cannot be forgotten at a call
   * site, and so a rejected transition leaves the stored session untouched.
   */
  function apply(
    run: (
      session: TrainingSessionState,
    ) => ReturnType<typeof completeCurrentStep>,
  ): void {
    const session = get().session;
    if (!session) return;

    const result = run(session);
    if (!result.ok) {
      set({ lastFailure: result.failure });
      return;
    }
    set({ session: result.state, lastFailure: null });
    void persist(result.state);
  }

  return {
    session: null,
    lastFailure: null,
    hydrated: false,

    begin: (content) => {
      const session = startSession(content, engineContext);
      set({ session, lastFailure: null, hydrated: true });
      void persist(session);
    },

    hydrate: async () => {
      try {
        const raw = await appStorage.getItem(STORAGE_KEYS.activeSession);
        const stored: unknown = raw ? JSON.parse(raw) : null;
        const parsed = trainingSessionStateSchema.safeParse(stored);
        /*
          Only an in-progress session is surfaced. A completed or abandoned one already has its record in the
          training log; loading it here would make Today offer to "pick up" something that is finished. It is not
          discarded either — `resumeOrBegin` still owns that decision, with the lesson content in hand.
        */
        if (parsed.success && parsed.data.status === "in_progress") {
          set({ session: parsed.data, lastFailure: null, hydrated: true });
          return;
        }
      } catch {
        // Unreadable persisted state is treated exactly like none at all, as `resumeOrBegin` does.
      }
      set({ hydrated: true });
    },

    resumeOrBegin: async (content) => {
      let stored: unknown = null;
      try {
        const raw = await appStorage.getItem(STORAGE_KEYS.activeSession);
        stored = raw ? JSON.parse(raw) : null;
      } catch {
        // Unreadable or non-JSON persisted state is treated exactly like none at all.
        stored = null;
      }

      if (stored !== null) {
        const restored = restoreSession(stored, content);
        if (restored.ok) {
          set({ session: restored.state, lastFailure: null, hydrated: true });
          return;
        }
        // Anything the engine will not vouch for is discarded rather than repaired, so a stale session can never
        // be resumed into a lesson it no longer matches — but real work is recorded before it is dropped.
        await archiveDisplacedSession(stored);
        await persist(null);
      }

      get().begin(content);
    },

    click: (content) =>
      apply((session) => recordClickerPress(session, content, engineContext)),

    addRepetition: (content) =>
      apply((session) => logRepetition(session, content, engineContext)),

    removeRepetition: (content) =>
      apply((session) => undoRepetition(session, content)),

    completeStep: (content, stepId) =>
      apply((session) =>
        completeCurrentStep(session, content, stepId, engineContext),
      ),

    viewTroubleshooting: (content, optionId) =>
      apply((session) =>
        openTroubleshooting(session, content, optionId, engineContext),
      ),

    closeTroubleshooting: (content, optionId) =>
      apply((session) =>
        resolveTroubleshooting(session, content, optionId, engineContext),
      ),

    abandon: (content) => {
      void content;
      apply((session) => abandonSession(session, engineContext));
    },

    clear: async () => {
      set({ session: null, lastFailure: null });
      await persist(null);
    },
  };
});

/**
 * Development-only bridge for driving a session without UI automation.
 *
 * Tap automation is unavailable in this environment, so simulator acceptance of a multi-step flow would otherwise
 * be unobservable. This exposes the same store actions the screens call, letting a session be walked step by step
 * while screenshots record what each state actually renders.
 *
 * It drives the store, not the buttons — the buttons themselves are exercised by the React Native Testing Library
 * flow tests, which fire real presses on the real components. A no-op in release builds.
 */
export function installSessionDevBridge(): void {
  if (!__DEV__) return;
  (globalThis as typeof globalThis & { __sessionDev?: unknown }).__sessionDev =
    {
      store: useSessionStore,
      state: () => useSessionStore.getState().session,
    };
}
