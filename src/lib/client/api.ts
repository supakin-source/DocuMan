import type { ApiError } from "@/lib/api";

/** Thrown by the helpers below when a route replies with a non-2xx status. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly reauth: boolean;

  constructor(status: number, body: ApiError) {
    super(body.error);
    this.name = "ApiRequestError";
    this.status = status;
    this.reauth = body.reauth ?? false;
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let body: ApiError = { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" };
  try {
    body = (await response.json()) as ApiError;
  } catch {
    // A proxy or a crash can reply with something that is not JSON; the default
    // message above is what the user sees then.
  }
  throw new ApiRequestError(response.status, body);
}

export async function apiGet<T>(url: string): Promise<T> {
  return unwrap<T>(await fetch(url, { cache: "no-store" }));
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PUT",
  body?: unknown,
): Promise<T> {
  return unwrap<T>(
    await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return unwrap<T>(await fetch(url, { method: "POST", body: form }));
}
