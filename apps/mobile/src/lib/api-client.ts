import { z } from "zod";
import { supabase } from "./supabase";
import { env } from "./env";

/**
 * API client foundation for the versioned `/v1` surface (API.md).
 *
 * Three things every call gets, so no screen has to remember them:
 *   - the caller's bearer token attached automatically
 *   - a request ID, matching the server's structured error contract
 *   - Zod validation of the response before it reaches app code
 *
 * That last one is the important one. Brief §46 requires validating all external data; parsing here means a screen
 * can never be handed a shape the domain model doesn't describe, and a backend change surfaces as a typed error at
 * the boundary rather than as `undefined` three components deep.
 */

const apiBaseUrl = env.apiBaseUrl;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.status = status;
    this.requestId = body.requestId;
  }
}

/** Raised when the server's response doesn't match the schema the client expects. */
export class ApiContractError extends Error {
  constructor(
    readonly path: string,
    readonly issues: z.ZodError,
  ) {
    super(`Response from ${path} did not match the expected schema`);
    this.name = "ApiContractError";
  }
}

function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
}

export interface ApiRequestOptions<TResponse> {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Schema for the success payload. Omit only for genuinely empty responses. */
  schema?: z.ZodType<TResponse>;
  signal?: AbortSignal;
}

async function authorizationHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiRequest<TResponse = unknown>({
  path,
  method = "GET",
  body,
  schema,
  signal,
}: ApiRequestOptions<TResponse>): Promise<TResponse> {
  const requestId = newRequestId();

  /**
   * Built conditionally rather than passing `undefined` for absent fields: under
   * `exactOptionalPropertyTypes`, `body: undefined` is not the same as omitting `body`, and `RequestInit` does not
   * accept it.
   */
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(await authorizationHeader()),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal) init.signal = signal;

  const response = await fetch(`${apiBaseUrl}${path}`, init);

  const text = await response.text();
  const payload: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    throw new ApiError(
      response.status,
      parsed.success
        ? parsed.data
        : {
            code: "UNKNOWN",
            message: `Request failed with ${response.status}`,
            requestId,
          },
    );
  }

  if (!schema) return undefined as TResponse;

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiContractError(path, parsed.error);
  }
  return parsed.data;
}
