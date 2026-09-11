import { create } from "zustand";
import type { Dog, OnboardingDraft } from "@pawcue/domain";
import { toDogInsert } from "@pawcue/domain";
import { appStorage, STORAGE_KEYS } from "../lib/storage";
import {
  createDog,
  fetchDog,
  listOwnDogs,
  updateDog,
  type DogUpdate,
} from "../dogs/dog-repository";

/**
 * The dog the app is training.
 *
 * The id is cached locally so **startup routing never waits on the network**: a returning user with a dog must
 * not see onboarding flash while a request resolves. The cached id is a routing hint; the row itself is the
 * server's, re-read when the app can reach it.
 *
 * After a merge the cached id stays valid — the merge re-parents the dog rather than replacing it — which is why
 * nothing here has to be cleared on sign-in.
 */

interface DogState {
  dogId: string | null;
  dog: Dog | null;
  hydrated: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  createFromDraft: (
    draft: OnboardingDraft,
    ownerUserId: string,
  ) => Promise<Dog>;
  refresh: () => Promise<void>;
  /** Adopts whatever dog the current identity owns. Used after sign-in, when the server is authoritative. */
  adoptOwnedDog: () => Promise<Dog | null>;
  update: (patch: DogUpdate) => Promise<Dog>;
  clear: () => Promise<void>;
}

export const useDogStore = create<DogState>((set, get) => ({
  dogId: null,
  dog: null,
  hydrated: false,
  error: null,

  hydrate: async () => {
    try {
      const dogId = await appStorage.getItem(STORAGE_KEYS.activeDogId);
      set({ dogId, hydrated: true });
    } catch {
      set({ dogId: null, hydrated: true });
    }
  },

  createFromDraft: async (draft, ownerUserId) => {
    const dog = await createDog(toDogInsert(draft, ownerUserId));
    await appStorage.setItem(STORAGE_KEYS.activeDogId, dog.id);
    set({ dog, dogId: dog.id, error: null });
    return dog;
  },

  refresh: async () => {
    const { dogId } = get();
    if (!dogId) return;
    try {
      const dog = await fetchDog(dogId);
      // A null result means the row is gone or no longer readable by this identity; the cached id is stale.
      if (!dog) {
        await appStorage.removeItem(STORAGE_KEYS.activeDogId);
        set({ dog: null, dogId: null });
        return;
      }
      set({ dog, error: null });
    } catch (error) {
      // Offline is not a reason to forget the dog: the cached id still routes correctly.
      set({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  },

  adoptOwnedDog: async () => {
    try {
      const dogs = await listOwnDogs();
      const dog = dogs[0] ?? null;
      if (!dog) return null;
      await appStorage.setItem(STORAGE_KEYS.activeDogId, dog.id);
      set({ dog, dogId: dog.id, error: null });
      return dog;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unknown error" });
      return null;
    }
  },

  update: async (patch) => {
    const { dogId } = get();
    if (!dogId) throw new Error("No active dog to update");
    const dog = await updateDog(dogId, patch);
    set({ dog, error: null });
    return dog;
  },

  clear: async () => {
    set({ dog: null, dogId: null });
    await appStorage.removeItem(STORAGE_KEYS.activeDogId);
  },
}));
