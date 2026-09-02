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
 * The LINE channel's own configuration, parsed separately from `serverEnv`.
 *
 * Kept apart on purpose: the webhook has no business demanding a Google OAuth
 * client be configured before it will answer, and the Google half has no
 * business demanding a LINE channel. Each half fails on what it actually needs.
 */
const lineEnvSchema = z.object({
  /** Signs every webhook delivery; without it nothing can be trusted. */
  LINE_CHANNEL_SECRET: z.string().min(1, "LINE_CHANNEL_SECRET is required"),
  /** Bearer token for replying and pushing. */
  LINE_CHANNEL_ACCESS_TOKEN: z
    .string()
    .min(1, "LINE_CHANNEL_ACCESS_TOKEN is required"),
});

export type LineEnv = z.infer<typeof lineEnvSchema>;

let cachedLine: LineEnv | undefined;

export function lineEnv(): LineEnv {
  if (cachedLine) return cachedLine;

  const parsed = lineEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.message).join("\n  - ");
    throw new Error(`Invalid LINE environment:\n  - ${missing}`);
  }

  cachedLine = parsed.data;
  return cachedLine;
}

/**
 * Absolute origin for links handed to LINE — LIFF pages and document links have
 * to be reachable from a phone, so a relative path is no use.
 *
 * `APP_URL` wins because Vercel's own `VERCEL_URL` is the per-deployment host,
 * which changes on every push and would leave already-sent messages pointing at
 * a stale deployment.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * A link to one of the app's own pages, opened from inside LINE.
 *
 * With `LINE_LIFF_ID` set, the page opens through LIFF — inside the LINE app,
 * with the LINE SDK available, so a signature drawn there can be attributed to
 * the person who drew it. Without it the same path still opens, in the ordinary
 * in-app browser, which is enough to look at something but not to prove who is
 * looking. The variable is therefore optional rather than required: the bot
 * works without it, it just cannot ask for anything that needs identity.
 */
export function liffUrl(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  const liffId = process.env.LINE_LIFF_ID?.trim();

  if (!liffId) return `${appUrl()}${withSlash}`;

  // LIFF opens its configured endpoint and appends `liff.state`, which it hands
  // back to the page as the path to show.
  return `https://liff.line.me/${liffId}?liff.state=${encodeURIComponent(withSlash)}`;
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
