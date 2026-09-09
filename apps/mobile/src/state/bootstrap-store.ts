import { create } from "zustand";
import { isSupabaseConfigured } from "../lib/supabase";
import { authProvider } from "../providers/SupabaseAuthProvider";
import { useSettingsStore } from "./settings-store";

/**
 * App bootstrap.
 *
 * The ordering here is a product requirement, not an implementation detail. Brief §1 and §38: the app must be
 * usable immediately, offline, with no account — so **nothing network-dependent is allowed to block the first
 * paint**. Settings hydration is local and awaited; the session is established in the background and its failure
 * is recorded, never surfaced as a blocking error.
 *
 * That means `status: "ready"` genuinely means "the user can start training", not "the backend answered".
 */

export type SessionStatus =
  "unknown" | "anonymous" | "authenticated" | "unavailable";

interface BootstrapState {
  status: "idle" | "hydrating" | "ready";
  sessionStatus: SessionStatus;
  userId: string | null;
  /** Recorded for diagnostics/UI hints. Never a reason to block the app. */
  sessionError: string | null;

  bootstrap: () => Promise<void>;
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  status: "idle",
  sessionStatus: "unknown",
  userId: null,
  sessionError: null,

  bootstrap: async () => {
    set({ status: "hydrating" });

    // Local, fast, and required before first paint so the UI never flashes the wrong language or direction.
    await useSettingsStore.getState().hydrate();
    set({ status: "ready" });

    if (!isSupabaseConfigured) {
      set({
        sessionStatus: "unavailable",
        sessionError: "Supabase is not configured",
      });
      return;
    }

    // Deliberately not awaited by the caller: the app is already usable at this point.
    void authProvider
      .ensureAnonymousSession()
      .then((session) => {
        set({
          sessionStatus:
            session.identityKind === "anonymous"
              ? "anonymous"
              : "authenticated",
          userId: session.userId,
          sessionError: null,
        });
      })
      .catch((error: unknown) => {
        set({
          sessionStatus: "unavailable",
          sessionError:
            error instanceof Error ? error.message : "Unknown session error",
        });
      });
  },
}));
