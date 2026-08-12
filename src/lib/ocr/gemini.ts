import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { serverEnv } from "@/lib/env";

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
  bytes: Buffer;
  mimeType: string;
};

let client: GoogleGenAI | undefined;

function genai(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: serverEnv().GOOGLE_GENAI_API_KEY });
  return client;
}

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

function inlinePart({ bytes, mimeType }: OcrInput) {
  return { inlineData: { mimeType, data: bytes.toString("base64") } };
}

/**
 * Transcribes a document to plain text, preserving reading order and layout
 * breaks. Handles Thai and English, including mixed-script documents.
 */
export async function extractText(input: OcrInput): Promise<string> {
  assertSupported(input);

  const response = await genai().models.generateContent({
    model: serverEnv().GEMINI_MODEL,
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

  return response.text ?? "";
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

  const response = await genai().models.generateContent({
    model: serverEnv().GEMINI_MODEL,
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
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(schema, { io: "output" }),
    },
  });

  const raw = response.text;
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
