/**
 * Centralized /v1 API route builders (brief §16, coding rule §46: "Centralize API paths"). Every network call in
 * the app goes through one of these functions, never a hand-typed path string at the call site.
 */
export const API_VERSION = "v1";

export const apiRoutes = {
  anonymousSession: () => `/${API_VERSION}/anonymous-session`,
  me: () => `/${API_VERSION}/me`,
  dogs: () => `/${API_VERSION}/dogs`,
  dog: (dogId: string) => `/${API_VERSION}/dogs/${dogId}`,
  dogGoals: (dogId: string) => `/${API_VERSION}/dogs/${dogId}/goals`,
  planGenerate: () => `/${API_VERSION}/plans/generate`,
  planCurrent: () => `/${API_VERSION}/plans/current`,
  planToday: () => `/${API_VERSION}/plans/today`,
  lesson: (lessonId: string) => `/${API_VERSION}/lessons/${lessonId}`,
  sessions: () => `/${API_VERSION}/sessions`,
  sessionEvents: (sessionId: string) =>
    `/${API_VERSION}/sessions/${sessionId}/events`,
  sessionComplete: (sessionId: string) =>
    `/${API_VERSION}/sessions/${sessionId}/complete`,
  progress: () => `/${API_VERSION}/progress`,
  entitlements: () => `/${API_VERSION}/entitlements`,
  purchasesVerify: () => `/${API_VERSION}/purchases/verify`,
  authMergeGuest: () => `/${API_VERSION}/auth/merge-guest`,
  preferences: () => `/${API_VERSION}/preferences`,
  accountDelete: () => `/${API_VERSION}/account/delete`,
} as const;
