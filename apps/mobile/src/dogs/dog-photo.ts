import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { PERMISSION_CATALOGUE } from "../providers/permissions";

/**
 * The dog's photo, on this device.
 *
 * **Storage decision.** `dogs.photo_url` exists in the schema but nothing serves it: there is no storage bucket,
 * no upload policy and no signed-URL path, and inventing that backend for a profile picture is not this
 * iteration's job. A device-local file URI written to `photo_url` would be worse than nothing — another device
 * would read a path it cannot open — so the photo stays local: copied into the app's document directory (which
 * the system never purges) and referenced from AsyncStorage by dog id. The illustrated character remains the
 * identity everywhere the photo is absent, which includes every other device. When a storage bucket exists, the
 * upload slots in behind `pickDogPhoto` without changing a screen.
 *
 * **Permission.** The library prompt is triggered only from inside `pickDogPhoto`, which only the "Add photo"
 * control calls — the catalogue entry `photoLibrary` records exactly that. Nothing here runs on mount, and the
 * camera is never requested (it is forbidden by the brief, and the config plugin declares no camera string).
 */

const DIRECTORY_NAME = "dog-photos";

/** The catalogue entry this module fulfils; asserted in tests so the trigger stays the documented one. */
export const PHOTO_PERMISSION = PERMISSION_CATALOGUE.photoLibrary;

export type PickPhotoResult =
  | { status: "picked"; uri: string }
  | { status: "cancelled" }
  | { status: "denied" }
  | { status: "failed" };

/**
 * Asks for the photo library, lets the owner choose and crop a square, and files the result under the dog's id.
 * Only ever called from an explicit user action.
 */
export async function pickDogPhoto(dogId: string): Promise<PickPhotoResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: "denied" };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return { status: "cancelled" };

  try {
    const uri = await storeDogPhoto(dogId, result.assets[0].uri);
    return { status: "picked", uri };
  } catch {
    return { status: "failed" };
  }
}

/** Copies a picked image into the app's own directory, replacing any earlier photo for this dog. */
export async function storeDogPhoto(
  dogId: string,
  sourceUri: string,
): Promise<string> {
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, `${dogId}.jpg`);
  if (destination.exists) destination.delete();
  await new File(sourceUri).copy(destination);
  return destination.uri;
}

/** Removes the stored photo. Safe to call when there is none. */
export function deleteDogPhoto(dogId: string): void {
  const file = new File(Paths.document, DIRECTORY_NAME, `${dogId}.jpg`);
  if (file.exists) file.delete();
}
