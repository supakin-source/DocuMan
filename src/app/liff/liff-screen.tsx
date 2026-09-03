"use client";

import type { ReactNode } from "react";

import { useLiff, type LiffState } from "@/app/liff/liff-provider";

/**
 * The three states every LIFF page shares, so no page has to draw its own
 * spinner or invent its own wording for "LINE would not tell us who you are".
 *
 * Children are given the ready state, so a page can only reach its own content
 * with an ID token already in hand — the type makes the unauthenticated case
 * unreachable rather than merely unlikely.
 */
export function LiffScreen({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: (liff: Extract<LiffState, { status: "ready" }>) => ReactNode;
}) {
  const liff = useLiff();

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-archivo text-xl font-semibold">{title}</h1>
        {hint ? <p className="text-sm text-neutral-600">{hint}</p> : null}
      </header>

      {liff.status === "loading" ? <Placeholder>กำลังเชื่อมต่อไลน์…</Placeholder> : null}
      {liff.status === "unavailable" ? <Notice>{liff.reason}</Notice> : null}
      {liff.status === "ready" ? children(liff) : null}
    </main>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-surface px-4 py-6 text-center text-sm text-neutral-600">
      {children}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-accent-100 px-4 py-3 text-sm text-accent-700">{children}</p>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-divider bg-white px-3 py-2 text-sm text-text " +
  "outline-none focus:border-accent";

export const primaryButtonClass =
  "w-full rounded-md bg-accent px-4 py-3 text-sm font-semibold text-white " +
  "disabled:opacity-50";

export const secondaryButtonClass =
  "w-full rounded-md border border-divider px-4 py-3 text-sm font-semibold text-text " +
  "disabled:opacity-50";
