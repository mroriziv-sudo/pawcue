import type { Uuid } from "../models/shared";

export type NotificationPermissionStatus =
  "granted" | "denied" | "undetermined";

/**
 * Concrete implementation: `expo-notifications` local scheduling. The OS permission prompt is triggered only from
 * `requestPermission`, which the app calls only after the user explicitly opts in (brief §18) — never at launch.
 */
export interface NotificationProvider {
  getPermissionStatus(): Promise<NotificationPermissionStatus>;
  requestPermission(): Promise<NotificationPermissionStatus>;
  scheduleTrainingReminder(
    dogId: Uuid,
    at: string,
  ): Promise<{ reminderId: Uuid }>;
  cancelReminder(reminderId: Uuid): Promise<void>;
}
