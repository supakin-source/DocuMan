import { z } from "zod";

import { serverEnv } from "@/lib/env";

const GENERATIVE_API = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini accepts these inline. Anything else must be converted before OCR.
 */
const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * Inline request payloads are capped by the API at 20 MB total. Documents above
 * this need the Files API instead; we fail loudly rather than send a request that
 * Google will reject with a less obvious error.
 */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

export type OcrInput = {
  bytes: Uint8Array;
  mimeType: string;
};

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function assertSupported({ bytes, mimeType }: OcrInput): void {
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new UnsupportedDocumentError(
      `${mimeType} cannot be read directly. Supported types: ${[...SUPPORTED_MIME_TYPES].join(", ")}`,
    );
  }

  if (bytes.byteLength > MAX_INLINE_BYTES) {
    throw new UnsupportedDocumentError(
      `Document is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB, above the ${MAX_INLINE_BYTES / 1024 / 1024} MB inline limit.`,
    );
  }
}

/**
 * Base64 without Node's Buffer, which the Workers runtime does not provide.
 * Chunked because spreading a multi-megabyte array into String.fromCharCode
 * overflows the call stack.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Calls generateContent over REST.
 *
 * The @google/genai SDK is not used: it depends on google-auth-library, `ws` and
 * `protobufjs`, which drag Node built-ins into a Workers bundle. For an
 * API-key-authenticated call this endpoint is a single POST.
 */
async function generateContent(body: unknown): Promise<string> {
  const env = serverEnv();

  const response = await fetch(
    `${GENERATIVE_API}/${env.GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GOOGLE_GENAI_API_KEY,
      },
      body: JSON.stringify(body),
    },
  );

  const raw = await response.text();

  if (!response.ok) {
    throw new OcrFailedError(`Gemini returned ${response.status}: ${raw.slice(0, 300)}`);
  }

  const parsed = JSON.parse(raw) as GenerateContentResponse;

  // A safety filter returns 200 with no candidates, which would otherwise read
  // as an empty document rather than a refusal.
  if (parsed.promptFeedback?.blockReason) {
    throw new OcrFailedError(
      `Gemini blocked the request: ${parsed.promptFeedback.blockReason}`,
    );
  }

  return (
    parsed.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

function inlinePart({ bytes, mimeType }: OcrInput) {
  return { inline_data: { mime_type: mimeType, data: toBase64(bytes) } };
}

/**
 * Transcribes a document to plain text, preserving reading order and layout
 * breaks. Handles Thai and English, including mixed-script documents.
 */
export async function extractText(input: OcrInput): Promise<string> {
  assertSupported(input);

  return generateContent({
    contents: [
      {
        role: "user",
        parts: [
          inlinePart(input),
          {
            text: [
              "Transcribe every piece of text in this document verbatim.",
              "Preserve the original reading order, line breaks and table structure.",
              "Keep Thai text in Thai — do not translate or transliterate.",
              "Do not add commentary, headings or explanations of your own.",
              "If a passage is illegible, write [ไม่ชัดเจน] in its place.",
            ].join(" "),
          },
        ],
      },
    ],
  });
}

/**
 * Reads a document and returns fields matching `schema`.
 *
 * The caller owns the shape: pass the zod schema for whatever the calling feature
 * needs, and the same schema both constrains Gemini's output and validates what
 * comes back. Fields Gemini cannot find are returned as null, so make optional
 * fields nullable in the schema rather than `.optional()`.
 */
export async function extractStructured<T extends z.ZodType>(
  input: OcrInput,
  schema: T,
  instructions: string,
): Promise<z.infer<T>> {
  assertSupported(input);

  const raw = await generateContent({
    contents: [
      {
        role: "user",
        parts: [
          inlinePart(input),
          {
            text: [
              instructions,
              "Return only JSON matching the required schema.",
              "Use null for any field the document does not state — never guess.",
              "Keep Thai values in Thai script exactly as written.",
            ].join(" "),
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
      response_json_schema: z.toJSONSchema(schema, { io: "output" }),
    },
  });

  if (!raw) {
    throw new OcrFailedError("Gemini returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OcrFailedError(`Gemini returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new OcrFailedError(
      `Gemini output did not match the expected schema: ${result.error.message}`,
    );
  }

  return result.data as z.infer<T>;
}

/** The document cannot be sent for OCR as-is (wrong type, or too large). */
export class UnsupportedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedDocumentError";
  }
}

/** OCR ran but produced something unusable. */
export class OcrFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrFailedError";
  }
}
