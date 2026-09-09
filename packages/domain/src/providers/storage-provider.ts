/**
 * Concrete implementation: Supabase Storage (dog photos, brief §11). Upload is only ever initiated from the
 * explicit "Add dog photo" tap (brief §18) — never eagerly.
 */
export interface StorageProvider {
  uploadDogPhoto(
    dogId: string,
    file: { uri: string; contentType: string },
  ): Promise<{ url: string }>;
  deleteDogPhoto(dogId: string): Promise<void>;
}
