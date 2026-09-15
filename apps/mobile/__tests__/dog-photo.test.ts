import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "../src/lib/storage";
import { PERMISSION_CATALOGUE } from "../src/providers/permissions";

/**
 * The dog's photo: local, optional, and asked for only when the owner asks.
 *
 * The picker and the file system are device capabilities and are faked here; what is under test is the store's
 * behaviour around them — that nothing is requested until `choose` is called, that a denial stores nothing, and
 * that a photo survives a restart and is gone after sign-out.
 */

const mockRequest = jest.fn();
const mockLaunch = jest.fn();
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) =>
    mockRequest(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunch(...args),
}));

jest.mock("expo-file-system", () => {
  const files = new Set<string>();
  const copies: Array<[string, string]> = [];
  (globalThis as Record<string, unknown>).__fakeFiles = files;
  (globalThis as Record<string, unknown>).__fakeCopies = copies;
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : p.uri))
        .join("/");
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : p.uri))
        .join("/");
    }
    get exists() {
      return files.has(this.uri);
    }
    delete() {
      files.delete(this.uri);
    }
    copy(destination: File) {
      copies.push([this.uri, destination.uri]);
      files.add(destination.uri);
      return Promise.resolve();
    }
  }
  return {
    Directory,
    File,
    Paths: { document: new Directory("file:///documents") },
  };
});

import { useDogPhotoStore } from "../src/state/dog-photo-store";
import { PHOTO_PERMISSION } from "../src/dogs/dog-photo";

const files = (globalThis as Record<string, unknown>)
  .__fakeFiles as Set<string>;
const copies = (globalThis as Record<string, unknown>).__fakeCopies as Array<
  [string, string]
>;

const DOG = "00000000-0000-4000-a000-000000000500";

beforeEach(async () => {
  jest.clearAllMocks();
  files.clear();
  copies.length = 0;
  await AsyncStorage.clear();
  useDogPhotoStore.setState({ photos: {}, hydrated: false });
  mockRequest.mockResolvedValue({ granted: true });
  mockLaunch.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/picked.jpg" }],
  });
});

describe("the permission boundary", () => {
  it("is the catalogue's photo-library entry, triggered by the owner adding a photo", () => {
    expect(PHOTO_PERMISSION).toBe(PERMISSION_CATALOGUE.photoLibrary);
    expect(PHOTO_PERMISSION.triggeredBy).toMatch(/photo/i);
  });

  it("asks for nothing on import or hydration", async () => {
    await useDogPhotoStore.getState().hydrate();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockLaunch).not.toHaveBeenCalled();
  });

  it("stores nothing when the library is denied, and says so", async () => {
    mockRequest.mockResolvedValue({ granted: false });

    const result = await useDogPhotoStore.getState().choose(DOG);

    expect(result.status).toBe("denied");
    expect(mockLaunch).not.toHaveBeenCalled();
    expect(useDogPhotoStore.getState().photoFor(DOG)).toBeNull();
  });
});

describe("choosing a photo", () => {
  it("copies it into the app's own directory and records it for this dog only", async () => {
    const result = await useDogPhotoStore.getState().choose(DOG);

    expect(result.status).toBe("picked");
    expect(copies).toEqual([
      ["file:///tmp/picked.jpg", `file:///documents/dog-photos/${DOG}.jpg`],
    ]);
    expect(useDogPhotoStore.getState().photoFor(DOG)).toMatch(
      new RegExp(`dog-photos/${DOG}\\.jpg`),
    );
    expect(useDogPhotoStore.getState().photoFor("another-dog")).toBeNull();
  });

  it("asks for a square crop from the library, never the camera", async () => {
    await useDogPhotoStore.getState().choose(DOG);
    expect(mockLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
      }),
    );
  });

  it("keeps whatever was there when the owner cancels", async () => {
    await useDogPhotoStore.getState().choose(DOG);
    const before = useDogPhotoStore.getState().photoFor(DOG);
    mockLaunch.mockResolvedValue({ canceled: true, assets: [] });

    const result = await useDogPhotoStore.getState().choose(DOG);

    expect(result.status).toBe("cancelled");
    expect(useDogPhotoStore.getState().photoFor(DOG)).toBe(before);
  });

  it("survives a restart", async () => {
    await useDogPhotoStore.getState().choose(DOG);
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.dogPhotos);
    expect(stored).toContain(DOG);

    useDogPhotoStore.setState({ photos: {}, hydrated: false });
    await useDogPhotoStore.getState().hydrate();

    expect(useDogPhotoStore.getState().photoFor(DOG)).toMatch(/dog-photos/);
  });

  it("treats unreadable stored state as no photos", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.dogPhotos, "{not json");
    await useDogPhotoStore.getState().hydrate();
    expect(useDogPhotoStore.getState().photos).toEqual({});
    expect(useDogPhotoStore.getState().hydrated).toBe(true);
  });
});

describe("removing", () => {
  it("forgets the photo and deletes the file", async () => {
    await useDogPhotoStore.getState().choose(DOG);
    expect(files.size).toBe(1);

    await useDogPhotoStore.getState().remove(DOG);

    expect(useDogPhotoStore.getState().photoFor(DOG)).toBeNull();
    expect(files.size).toBe(0);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.dogPhotos)).toBe("{}");
  });

  it("clears every photo when the identity leaves the device", async () => {
    await useDogPhotoStore.getState().choose(DOG);
    await useDogPhotoStore.getState().choose("dog-two");

    await useDogPhotoStore.getState().clear();

    expect(useDogPhotoStore.getState().photos).toEqual({});
    expect(files.size).toBe(0);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.dogPhotos)).toBeNull();
  });
});
