# DocuMan

Document Management Solutions.

Next.js (App Router) application backed by PostgreSQL, Google sign-in, Google
Drive storage and Gemini-based OCR.

## Stack

| Concern    | Choice                                            |
| ---------- | ------------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript     |
| Styling    | Tailwind CSS 4                                    |
| Database   | PostgreSQL via Prisma 7 (`@prisma/adapter-pg`)    |
| Auth       | Auth.js v5 (`next-auth@beta`) — Google provider   |
| Storage    | Google Drive (`drive.file` scope)                 |
| OCR        | Google AI Studio — Gemini 2.5 Flash               |

## Getting started

```bash
pnpm install
cp .env.example .env      # then fill in the values below
pnpm exec prisma migrate dev
pnpm dev
```

### The first admin

The HR fields a document prints — employee code, position, approver — cannot come
from Google sign-in, so someone has to set them. Grant the first admin by hand:

```bash
# sign in with Google once first, so the account exists
pnpm admin:grant someone@assetfive.co.th
```

They can then set everyone else up at `/admin`. Creating the row before that
first sign-in would leave a User with no linked Account, which Auth.js refuses to
attach an OAuth identity to — hence the ordering.

### Environment

Every variable is documented in `.env.example`. The ones without a sensible
default:

- `DATABASE_URL` — PostgreSQL connection string.
- `AUTH_SECRET` — generate with `pnpm exec auth secret`.
- `AUTH_TRUST_HOST=true` — required whenever the app is not on Vercel, including
  local development. Without it Auth.js rejects every request with
  `UntrustedHost`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — OAuth client from the Google Cloud
  console. Add `http://localhost:3000/api/auth/callback/google` as an authorised
  redirect URI, and enable the **Google Drive API** on the same project.
- `GOOGLE_GENAI_API_KEY` — API key from [AI Studio](https://aistudio.google.com/apikey).
- `ALLOWED_EMAIL_DOMAINS` — comma-separated allow-list for sign-in. Empty means
  any Google account may sign in.

The Google OAuth client, the Drive API and the AI Studio key can all live in one
Google Cloud project; sign-in and Drive access share a single consent screen.

## Scripts

| Script             | Purpose                                    |
| ------------------ | ------------------------------------------ |
| `pnpm dev`         | Development server                         |
| `pnpm build`       | Production build                           |
| `pnpm typecheck`   | `tsc --noEmit`                             |
| `pnpm lint`        | ESLint                                     |
| `pnpm test`        | Unit and integration tests (needs the DB)  |
| `pnpm db:migrate`  | Create and apply a migration               |
| `pnpm db:deploy`   | Apply migrations (deployment)              |
| `pnpm db:studio`   | Prisma Studio                              |
| `pnpm admin:grant` | Grant ADMIN to an existing account          |

## Layout

```
prisma/schema.prisma      Database schema
src/app/(app)/            Signed-in screens, inside the phone frame
src/app/api/              Route handlers
src/auth.config.ts        Edge-safe Auth.js config — shared with src/proxy.ts
src/auth.ts               Full Auth.js config with the Prisma adapter
src/proxy.ts              Route protection (Next 16 `proxy`, formerly middleware)
src/components/           Shared UI, including the printable document sheets
src/lib/domain/           Document lifecycle, user administration, the rules
src/lib/google/           Per-user OAuth client and Drive access
src/lib/ocr/              Text and structured extraction via Gemini
src/lib/thai.ts           Buddhist Era dates and baht-in-words
scripts/grant-admin.ts    Bootstraps the first admin
design/                   The Claude Design export this is implemented against
```

## Screens

| Route                    | Purpose                                        |
| ------------------------ | ---------------------------------------------- |
| `/login`                 | Google sign-in                                 |
| `/`                      | Requester dashboard                            |
| `/create`                | Pick a category, start a draft                 |
| `/create/[id]/upload`    | Attach receipts; each is uploaded and read     |
| `/create/[id]/review`    | Confirm and correct what OCR proposed          |
| `/create/[id]/sign`      | Draw the requester's signature                 |
| `/create/[id]/preview`   | A4 preview, certificate toggle, submit         |
| `/documents`             | Every document you raised, filtered by status   |
| `/documents/[id]`        | A submitted document, and the way back to edit |
| `/approve`               | Approver dashboard: queue, month, trend        |
| `/approve/[id]`          | Review and decide                              |
| `/approve/history`       | Everything you have ruled on                   |
| `/notifications`         | Verdicts on your claims, and what awaits you   |
| `/profile`               | Your details, roles and stored signature       |
| `/admin`                 | User administration (ADMIN only)               |
| `/admin/[id]`            | HR fields, approver and roles for one account  |

## Notes

- **Drive scope.** DocuMan requests `drive.file`, which grants access only to
  files it creates. Widening this needs a privacy review first.
- **Refresh tokens.** Google returns one only on first consent, so
  `src/lib/google/oauth.ts` never overwrites a stored refresh token with an empty
  value. A user whose token is missing must sign in again.
- **OCR size limit.** Documents are sent inline and capped at 18 MB. Larger files
  need the Gemini Files API.
- **OCR proposes, it does not decide.** A mileage line's amount is always
  recomputed from distance × rate on the server, whatever the model read, and
  the per-km rate is company policy rather than something printed on a map.
- **Pagination.** The printable sheets are a continuous A4-width flow with
  `break-inside: avoid` on each block, so the browser paginates them on print or
  PDF export. The prototype measured and split pages itself; letting the
  browser do it keeps long claims correct at any content length.
- **HR profile.** `employeeCode`, `position` and `approverId` cannot come from
  Google sign-in and are maintained at `/admin`. Submitting is refused with a
  clear message until an approver is assigned, and the admin list flags every
  account still missing one.
- **Notifications are derived, not stored.** Every event worth telling someone
  about is already on DocumentEvent, so a parallel table would only be a second
  copy to keep in step. Read state is one timestamp per user; anything newer is
  unread. Opening the screen is what marks them read.
- **Approval chains.** An approver assignment is rejected if it would close a
  loop — if the candidate already reports, directly or through others, to the
  person being edited — since no document inside such a loop could reach anyone
  allowed to decide it. An admin also cannot remove their own ADMIN role, which
  would otherwise lock the organisation out of `/admin`.

## Status

Every screen in the design is built, including the four tab-bar destinations it
greys out — those had no drawn design, so they follow the system's own
conventions. 51 tests cover the Thai formatting, the document lifecycle, the
administration rules and the notification feed.
