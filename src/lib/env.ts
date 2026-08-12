import { z } from "zod";

/**
 * Server-side environment contract. Parsed lazily so that importing this module
 * from an edge/middleware bundle does not require the full set of secrets.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_GOOGLE_ID: z.string().min(1, "AUTH_GOOGLE_ID is required"),
  AUTH_GOOGLE_SECRET: z.string().min(1, "AUTH_GOOGLE_SECRET is required"),
  GOOGLE_GENAI_API_KEY: z.string().min(1, "GOOGLE_GENAI_API_KEY is required"),
  // "gemini-2.5-flash" is still listed by ListModels but rejects generateContent
  // for API keys created after Google's cutoff ("no longer available to new
  // users") — confirmed against the live API on 2026-08-12. The "-latest" alias
  // tracks whatever Google currently points it at, so this does not go stale the
  // same way a pinned version number will.
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),
  GOOGLE_DRIVE_ROOT_FOLDER_NAME: z.string().default("DocuMan"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.message)
      .join("\n  - ");
    throw new Error(
      `Invalid server environment. Copy .env.example to .env and fill in:\n  - ${missing}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * E-mail domains permitted to sign in. An empty list means "any Google account".
 */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}
