# AI integration (Gemini OCR)

DocuMan uses Google's Gemini API for one job: reading receipts. A requester
attaches a photo or PDF on `/create/[id]/upload`, and Gemini either
transcribes it (`extractText`) or returns structured fields — amount, date,
origin/destination — validated against a Zod schema (`extractStructured`).
Both live in `src/lib/ocr/gemini.ts`.

## What gets extracted from a receipt

`gemini.ts` is generic transport — any Zod schema, any instructions. The one
schema this app actually asks for today lives in `src/lib/ocr/travel.ts`,
for travel expenses (the only category DocuMan currently has).
`src/app/api/documents/[id]/attachments/route.ts` calls its
`extractTravelItem` right after a file lands in Drive, and never lets a
failed read fail the upload — the attachment is created either way, so a
bad read costs a manual correction later, not a lost file.

The schema Gemini is constrained to (`extractionSchema` in `travel.ts`):

| Field         | Type                                                          | Notes |
| ------------- | -------------------------------------------------------------- | ----- |
| `kind`        | `personal_vehicle` \| `public_transport` \| `toll` \| `unknown` | Map screenshot vs. bus/train/taxi receipt vs. expressway/parking slip |
| `date`        | Gregorian `YYYY-MM-DD`, nullable                                | The instructions tell the model to convert from พ.ศ. itself |
| `origin` / `destination` | free text, nullable                                  | |
| `distanceKm`  | number, nullable                                                | Only meaningful for `personal_vehicle` |
| `amount`      | number (THB), nullable                                         | Null for a map screenshot, which shows no price |

Every field but `kind` is nullable on purpose: the instructions tell the
model to leave anything the document doesn't state as null rather than
guess, because a wrong guess is worse than a blank the reviewer notices.

Two things the calling code does with the result that are easy to miss:

- `kind: "unknown"` still becomes a line (as `PUBLIC_TRANSPORT`, flagged
  `uncertain: true`) instead of being dropped — the user already waited for
  the upload, so an unrecognized document still needs a line to fill in.
- A `personal_vehicle` line's `amount` from the model is always discarded
  and recomputed server-side as `distanceKm × ratePerKm`
  (`DEFAULT_RATE_PER_KM`, company policy, not something printed on a map
  screenshot) — no figure the model reads off a document is ever trusted
  for money on that line.

### Adding another document category

There's one schema today because there's one expense category (`TRAVEL`).
A category that needs its own extraction should follow `travel.ts`'s
shape: its own Zod schema and instructions string, calling the shared
`extractStructured` from `gemini.ts` — not a new code path inside
`gemini.ts` itself, which is meant to stay category-agnostic.

## Where the model is chosen

The model name is **never hardcoded**. It comes from the `GEMINI_MODEL`
environment variable (`src/lib/env.ts`), defaulting to `gemini-flash-latest`.

This is the one thing worth understanding before touching this integration:
Google periodically retires specific model versions. `gemini-2.5-flash` is a
real, previously-working example — it's still returned by the API's own
`ListModels` call, but `generateContent` rejects it for any API key created
after Google's cutoff, with "no longer available to new users". A pinned
version number *will* go stale again; that isn't a one-off bug, it's how
Google ships model deprecations.

`gemini-flash-latest` is a rolling alias Google keeps pointed at whatever
their current recommended Flash model is. Using it means this integration
doesn't need a code change every time Google retires a version — only an
env var, and only if the alias itself is ever retired (it hasn't been).

## If Gemini starts rejecting requests

The error always looks the same shape: `generateContent` returns 404 or 400
with a message like "model not found" or "no longer available". When that
happens:

1. Confirm which models the API key can actually call:
   ```bash
   curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_GENAI_API_KEY" \
     | grep -o '"name": "models/[^"]*'
   ```
   `ListModels` lists more than the key can use — verify with a real
   `generateContent` call before picking one.
2. Prefer another `-latest` alias (e.g. a newer Flash generation) over a
   pinned version, for the same reason as above.
3. Update `GEMINI_MODEL` everywhere it's set — it is **not** a single
   source of truth, so update all of these together:
   - Local `.env`
   - Netlify → Site configuration → Environment variables
   - GitHub repo secrets, if the "Verify Google integrations" workflow reads
     it (currently it doesn't need to — that workflow only sets the four
     required secrets, and `GEMINI_MODEL` falls back to its default; only
     add it there if a non-default model is needed for that check too)
4. Redeploy (Netlify) and re-run **Verify Google integrations** from the
   GitHub Actions tab.

No code change is needed for a model swap. If one seems necessary, that's a
sign the new model's behavior differs in a way `src/lib/ocr/gemini.ts`
doesn't already handle generically (see below) — treat that as its own bug,
not routine model maintenance.

## What verifies a model actually works

`pnpm verify:google <email>` (`scripts/verify-google.ts`) — also runnable
from the Actions tab via **Verify Google integrations** — sends a real OCR
request and checks two things that would silently produce wrong data on a
claim:

- The model honors the JSON schema constraint (`response_json_schema`),
  not just prose that happens to look like JSON.
- It converts a Buddhist Era date correctly: "28 กรกฎาคม 2569" → `2026-07-28`.
  Getting this wrong dates every claim 543 years out — this is the one
  behavior a model swap could plausibly change without erroring at all, so
  it's asserted explicitly rather than just checking the call didn't throw.

Run this after any `GEMINI_MODEL` change, not just after code changes.

## Why the raw API, not `@google/genai`

`generateContent` is called directly over `fetch` (`GENERATIVE_API` constant
in `gemini.ts`) instead of through Google's SDK. The SDK pulls in
`google-auth-library`, `ws`, and `protobufjs` — none needed for a single
API-key-authenticated POST, and all of them Node-specific enough to have
caused real problems the one time this app targeted a non-Node runtime
(Cloudflare Workers, before the move to Netlify). The four REST calls this
needs are simple enough that hand-rolling them costs less than keeping the
SDK portable would. The same reasoning applies to `src/lib/google/drive.ts`.
