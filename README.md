# DocuMan

Document Management Solutions.

Next.js (App Router) application backed by PostgreSQL, Google sign-in, Google
Drive storage and Gemini-based OCR.

## Stack

| Concern    | Choice                                            |
| ---------- | ------------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript     |
| Styling    | Tailwind CSS 4                                    |
| Database   | PostgreSQL via Prisma 7 (Neon in production, `pg` locally/CI) |
| Auth       | Auth.js v5 (`next-auth@beta`) — Google provider   |
| Storage    | Google Drive (`drive.file` scope)                 |
| OCR        | Google AI Studio — Gemini                         |

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
  See `docs/ai-integration.md` for how the Gemini model is chosen and what to
  do when Google retires one.
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
| `pnpm line:link`   | Link an account to a LINE user id           |

## Layout

```
prisma/schema.prisma      Database schema
src/app/(app)/            Signed-in screens, inside the phone frame
src/app/liff/             The pages the bot links to, opened inside LINE
src/app/api/              Route handlers
src/auth.config.ts        Edge-safe Auth.js config — shared with src/proxy.ts
src/auth.ts               Full Auth.js config with the Prisma adapter
src/proxy.ts              Route protection (Next 16 `proxy`, formerly middleware)
src/components/           Shared UI, including the printable document sheets
src/lib/domain/           Document lifecycle, user administration, the rules
src/lib/google/           Per-user OAuth client and Drive access
src/lib/line/             The OA: transport, identity, cards, conversation
src/lib/ocr/              Text and structured extraction via Gemini
src/lib/thai.ts           Buddhist Era dates and baht-in-words
scripts/grant-admin.ts    Bootstraps the first admin
docs/ai-integration.md    How the Gemini model is chosen, and swapping it
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

## The LINE OA

The workflow is moving into a LINE Official Account: receipts are sent to the
bot, and the claim is built, corrected and decided there rather than in the web
screens.

Set up in the [LINE Developers console](https://developers.line.biz/console/):
a Messaging API channel, with **Auto-reply** and **Greeting messages** turned
off (they answer over the bot's own replies), and the webhook pointed at
`https://<app>/api/line/webhook`. `LINE_CHANNEL_SECRET` and
`LINE_CHANNEL_ACCESS_TOKEN` come from that channel; `LINE_LIFF_ID` and
`LINE_LOGIN_CHANNEL_ID` come from the LIFF app and the LINE Login channel it
belongs to.

**Both channels must sit under one provider.** The user id in a LIFF ID token
matches the one on a webhook event only when they do; split across two
providers, the same person arrives as two unrelated ids and nothing lines up.

Set the LIFF app's **Endpoint URL to the site root** — `https://<app>`, not
`https://<app>/liff`. LINE appends the path from a `liff.line.me` link to that
endpoint, so an endpoint ending in `/liff` opens `/liff/liff/signature`. The
app's **Scopes** must include `openid`, or `liff.getIDToken()` returns null and
the pages have no way to say who is looking.

### The conversation

Send a photo — a receipt, a ticket, a toll slip, a screenshot of a map route —
and it becomes a line on the current claim, read by Gemini and answered with a
card showing what was found and what was not. Everything else is a command,
matched on a phrase rather than an exact string, since people type sentences:

| Say | What happens |
| --- | ------------ |
| “รายการ”     | The claim as it stands, with its total |
| “ส่งอนุมัติ”   | Signs it with the stored signature and sends it |
| “เริ่มใหม่”    | Starts a fresh claim |
| “ลายเซ็น”     | Opens the page to draw or redraw the signature |
| “สรุป”        | The month's approved total (approvers only) |

**There is no "current claim" table.** It is derived: the most recently touched
document that is still editable. That is the draft being built — or the document
an approver has just sent back, which is precisely what the next photo is for.

**A line may be incomplete.** OCR misreads a crumpled receipt often enough that
refusing the upload would be worse than accepting a line with a hole in it, so
the card names what is missing and `submitDocument` refuses the claim until it
is filled in. Nothing incomplete can reach an approver.

### Identity and signatures

**Identity has no sign-in.** The only evidence of who is talking is the opaque
`userId` LINE puts on each event, which is enough to recognise someone already
linked but says nothing about a stranger. Linking is therefore an admin step:
someone the bot does not know is shown their own LINE id and asked to pass it
on, and an admin runs

```bash
pnpm line:link someone@assetfive.co.th U1234567890abcdef...
```

Letting the bot link an account from a chat message instead — "I'm
somebody@assetfive.co.th" — would let anyone file expenses as anyone else,
since a chat message is a claim rather than proof.

**The signature is drawn once**, not per document: there is no canvas in a chat
window, so `User.signature` is what submitting and approving sign with. It is
copied onto the document at that moment rather than referenced, so redrawing it
later does not rewrite claims already signed with the old mark.

### The pages inside LINE

Three things do not fit in a chat bubble, and each is a LIFF page the bot links
to: drawing a signature, correcting a line OCR misread, and reading a whole
claim before deciding on it.

| Page | For |
| ---- | --- |
| `/liff/signature`      | Draw or redraw the stored signature |
| `/liff/items/[id]`     | Fix one line, against the receipt beside it |
| `/liff/documents/[id]` | The claim in full, for the approver |

**A web page carries no envelope.** The webhook can trust a `userId` because
LINE signs the delivery; anything a browser sends is written by the browser, and
a page that believed a `?user=` parameter would let anyone sign as anyone else.
So these pages authenticate with a LIFF **ID token** — a JWT LINE issues naming
the person viewing — handed to LINE's own `/oauth2/v2.1/verify` to check rather
than verified here, since LINE holds the key and decides the audience and
expiry. The identity that comes back is still only a LINE id, and still has to
resolve to an account an admin linked: the token proves who is holding the
phone, not that they work here.

The decision itself stays in the chat. Sending an approver to a web page to
press a button they could press in the notification is a step for its own sake —
what the page adds is what a Flex bubble cannot hold: every line, and the
receipts.

## Deploying to Vercel

Import the repository in the Vercel dashboard (Add New → Project → this repo).
Next.js needs no configuration file there: Vercel detects the framework, runs
`pnpm build`, and redeploys on every push to `main`.

Set these under Settings → Environment Variables:
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
`GOOGLE_GENAI_API_KEY`, `ALLOWED_EMAIL_DOMAINS`, `AUTH_TRUST_HOST=true`, and —
for the OA — `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LIFF_ID`,
`LINE_LOGIN_CHANNEL_ID` and `APP_URL` set to the stable production URL.
Skipping `ALLOWED_EMAIL_DOMAINS` opens sign-in to any Google account, not just
the company domain — `src/lib/env.ts` treats an empty value as "allow all".

Two things about the plan, because both bite silently rather than loudly:
Vercel's Hobby tier is licensed for non-commercial personal projects, which an
internal company tool is not; and it caps a serverless function at 10 seconds,
which is not enough headroom for rendering a PDF through headless Chromium
(cold start alone runs 3-8 seconds). Both are Pro-tier concerns rather than
code ones, but the second one decides how PDFs get generated.

`DATABASE_URL` should point at Neon rather than a conventional managed
Postgres: this app is used a handful of times a month, and Neon suspends when
idle and resumes on the next connection, with nothing to wake by hand. Vercel
functions run on Node, so `pg` (used locally and in CI) would work too, but
there is no reason to run two databases — `src/lib/db.ts` picks the Neon
adapter whenever `DATABASE_URL` is a `.neon.tech` host and falls back to `pg`
otherwise.

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
