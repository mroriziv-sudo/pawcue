import { create } from "zustand";
import { appStorage, STORAGE_KEYS } from "../lib/storage";
import {
  deleteDogPhoto,
  pickDogPhoto,
  type PickPhotoResult,
} from "../dogs/dog-photo";

/**
 * Which dog has a photo on this device, and where it is.
 *
 * Local by design — see `dog-photo.ts` for why the row's `photo_url` stays untouched. The map is keyed by dog id
 * so a second dog, or a re-created one after deletion, never inherits a photo that is not theirs. Hydrated with
 * the other local reads at bootstrap, so the first paint of Today already shows the photo.
 */

interface DogPhotoState {
  photos: Record<string, string>;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  photoFor: (dogId: string | null | undefined) => string | null;
  /** Runs the whole pick — permission, library, crop, copy — and records the result. User action only. */
  choose: (dogId: string) => Promise<PickPhotoResult>;
  remove: (dogId: string) => Promise<void>;
  clear: () => Promise<void>;
}

async function persist(photos: Record<string, string>): Promise<void> {
  await appStorage.setItem(STORAGE_KEYS.dogPhotos, JSON.stringify(photos));
}

export const useDogPhotoStore = create<DogPhotoState>((set, get) => ({
  photos: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await appStorage.getItem(STORAGE_KEYS.dogPhotos);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      const photos =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? Object.fromEntries(
              Object.entries(parsed as Record<string, unknown>).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            )
          : {};
      set({ photos, hydrated: true });
    } catch {
      set({ photos: {}, hydrated: true });
    }
  },

  photoFor: (dogId) => (dogId ? (get().photos[dogId] ?? null) : null),

  choose: async (dogId) => {
    const result = await pickDogPhoto(dogId);
    if (result.status === "picked") {
      // A cache-busting suffix: the file name is stable, so an Image that already showed the old photo would
      // otherwise keep it.
      const uri = `${result.uri}?v=${Date.now()}`;
      const photos = { ...get().photos, [dogId]: uri };
      set({ photos });
      await persist(photos);
      return { status: "picked", uri };
    }
    return result;
  },

  remove: async (dogId) => {
    const photos = { ...get().photos };
    delete photos[dogId];
    set({ photos });
    await persist(photos);
    try {
      deleteDogPhoto(dogId);
    } catch {
      /* The reference is gone; an orphaned file is harmless and overwritten on the next pick. */
    }
  },

  clear: async () => {
    const ids = Object.keys(get().photos);
    set({ photos: {} });
    await appStorage.removeItem(STORAGE_KEYS.dogPhotos);
    for (const id of ids) {
      try {
        deleteDogPhoto(id);
      } catch {
        /* See `remove`. */
      }
    }
  },
}));
