"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LiffScreen, Notice, Placeholder } from "@/app/liff/liff-screen";

/**
 * Where every `liff.line.me` link actually lands, however briefly.
 *
 * A LIFF app has exactly one Endpoint URL, and `/liff/signature`,
 * `/liff/items/[id]` and `/liff/documents/[id]` cannot each be that URL — it
 * is fixed at `/liff`. LINE's own answer for the rest of the path is
 * `liff.state`: a link like `liff.line.me/{id}/signature` opens the Endpoint
 * unchanged, with `/signature` packed into a `liff.state` query parameter, and
 * the SDK is documented to complete a second, real navigation once
 * `liff.init()` resolves — to the Endpoint's own path with that remainder
 * appended, i.e. `/liff/signature`. (`liffUrl()` in `src/lib/env.ts` is what
 * strips `/liff` back off before building the link, so this doubles up
 * correctly rather than landing on `/liff/liff/signature`.)
 *
 * That second navigation is a full page load, so ordinarily this component
 * never has anything left to do — the browser is already gone before its own
 * effect would run. The manual `router.replace` below is the fallback for
 * whichever half of that two-step redirect the SDK does not perform itself:
 * read `liff.state`, rebuild the absolute path, finish the hop.
 *
 * Why this page even needs to exist: the Endpoint URL has to be something that
 * answers without a redirect of its own, and `/` is `(app)`'s dashboard, which
 * sends anyone with no session straight to `/login` before the LIFF SDK's own
 * script has a chance to run. `/liff` carries no such gate.
 */
export default function LiffEntryPage() {
  return <LiffScreen title="กำลังเปิด…">{() => <Bounce />}</LiffScreen>;
}

function Bounce() {
  const router = useRouter();
  const [unresolved, setUnresolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const state = new URLSearchParams(window.location.search).get("liff.state");
      const suffix = state === null ? null : state.startsWith("/") ? state : `/${state}`;

      // liff.state is carried in a public URL, so it is not trusted with
      // anywhere other than a path under this same app.
      const safe = suffix !== null && !suffix.includes("://") && !suffix.startsWith("//");

      if (safe) {
        router.replace(`/liff${suffix}`);
        return;
      }

      if (!cancelled) setUnresolved(true);
    }

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (unresolved) {
    return <Notice>เปิดหน้านี้ไม่ถูกต้อง กรุณาเปิดผ่านลิงก์ที่บอทส่งมาอีกครั้ง</Notice>;
  }

  return <Placeholder>กำลังเปิดหน้าที่ถูกต้อง…</Placeholder>;
}
