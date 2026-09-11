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
import { appStorage, STORAGE_KEYS } from "../lib/storage";
import { uuidV4 } from "../lib/uuid";

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
        // be resumed into a lesson it no longer matches.
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
