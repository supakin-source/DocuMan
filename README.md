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

### Environment

Every variable is documented in `.env.example`. The ones without a sensible
default:

- `DATABASE_URL` — PostgreSQL connection string.
- `AUTH_SECRET` — generate with `pnpm exec auth secret`.
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
| `pnpm db:migrate`  | Create and apply a migration               |
| `pnpm db:deploy`   | Apply migrations (deployment)              |
| `pnpm db:studio`   | Prisma Studio                              |

## Layout

```
prisma/schema.prisma      Database schema (auth models; domain models pending)
src/auth.config.ts        Edge-safe Auth.js config — shared with src/proxy.ts
src/auth.ts               Full Auth.js config with the Prisma adapter
src/proxy.ts              Route protection (Next 16 `proxy`, formerly middleware)
src/lib/db.ts             Prisma client singleton
src/lib/env.ts            Validated server environment
src/lib/roles.ts          Role narrowing for JWT claims
src/lib/google/oauth.ts   Per-user Google OAuth client with token refresh
src/lib/google/drive.ts   Drive upload / download / trash
src/lib/ocr/gemini.ts     Text and structured extraction via Gemini
```

## Notes

- **Drive scope.** DocuMan requests `drive.file`, which grants access only to
  files it creates. Widening this needs a privacy review first.
- **Refresh tokens.** Google returns one only on first consent, so
  `src/lib/google/oauth.ts` never overwrites a stored refresh token with an empty
  value. A user whose token is missing must sign in again.
- **OCR size limit.** Documents are sent inline and capped at 18 MB. Larger files
  need the Gemini Files API.

## Status

The authentication, storage and OCR foundations are in place. The user-facing
screens and the document domain model come from the DocuMan design
(`DocuMan.dc.html`) and are not implemented yet.
