"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LiffScreen, Notice, Placeholder } from "@/app/liff/liff-screen";

/**
 * Where every `liff.line.me` link actually lands.
 *
 * A LIFF app has exactly one Endpoint URL, and `/liff/signature`,
 * `/liff/items/[id]` and `/liff/documents/[id]` cannot each be that URL. LINE's
 * own answer is `liff.state`: a link like `liff.line.me/{id}/liff/signature`
 * does not change which page loads first — it opens the Endpoint URL with the
 * extra path packed into a `liff.state` query parameter, and the SDK is
 * documented to complete a second, real navigation to that path once
 * `liff.init()` resolves.
 *
 * That second navigation is a full page load, landing back on this same route
 * (the layout's LiffProvider calls `liff.init()` again there, same as any
 * other `/liff/*` page), so ordinarily this component never has anything left
 * to do. The manual `router.replace` below exists only for the case where the
 * SDK's own hop does not happen — read the state and finish the job rather
 * than leave someone on a blank landing page.
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

      // Same-origin, and under /liff specifically: liff.state is carried in a
      // public URL, so it is not trusted with anywhere else to send the browser.
      if (state?.startsWith("/liff/")) {
        router.replace(state);
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
