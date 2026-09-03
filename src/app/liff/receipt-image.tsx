"use client";

import { useEffect, useState } from "react";

import { liffFetch } from "@/app/liff/liff-provider";

/**
 * The receipt behind a line, fetched rather than linked.
 *
 * An `<img src>` sends no Authorization header, and these are other people's
 * expense receipts — putting them on a URL that works without one would make
 * every attachment id a guessable link to a stranger's paperwork. So the bytes
 * come through `fetch`, and the blob URL is revoked when the view goes away.
 */
export function ReceiptImage({
  idToken,
  attachmentId,
}: {
  idToken: string;
  attachmentId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    liffFetch(idToken, `/api/liff/attachments/${attachmentId}/content`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [idToken, attachmentId]);

  if (failed) {
    return (
      <p className="rounded-md bg-surface px-3 py-4 text-center text-xs text-neutral-600">
        เปิดไฟล์แนบไม่ได้
      </p>
    );
  }

  if (!url) {
    return <div className="h-40 animate-pulse rounded-md bg-surface" />;
  }

  return (
    // A blob URL: next/image has nothing to optimise and no loader would take it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="ไฟล์แนบของรายการนี้"
      className="max-h-72 w-full rounded-md border border-divider bg-white object-contain"
    />
  );
}
