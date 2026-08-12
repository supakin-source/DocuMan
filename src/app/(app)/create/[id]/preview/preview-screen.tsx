"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ScreenHeader } from "@/components/screen-header";
import { SheetViewer } from "@/components/sheet-viewer";
import { ApiRequestError, apiSend } from "@/lib/client/api";

/**
 * Final look before submitting.
 *
 * The sheets are rendered on the server and handed in as `detail` and
 * `certificate`, so the same markup drives the on-screen preview, the printed
 * page and the approver's view of the document.
 */
export function PreviewScreen({
  documentId,
  detail,
  certificate,
}: {
  documentId: string;
  detail: ReactNode;
  certificate: ReactNode;
}) {
  const router = useRouter();
  const [withCertificate, setWithCertificate] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    // Read at submit time rather than mirrored into state: nothing on this
    // screen renders the mark, so holding it would only risk going stale.
    const signature = sessionStorage.getItem(`documan:signature:${documentId}`);
    if (!signature) {
      setConfirming(false);
      setError("ไม่พบลายเซ็น กรุณาลงลายเซ็นอีกครั้ง");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiSend(`/api/documents/${documentId}/submit`, "POST", {
        signature,
        remember: false,
      });
      sessionStorage.removeItem(`documan:signature:${documentId}`);
      router.push(`/create/${documentId}/success`);
    } catch (cause) {
      setSubmitting(false);
      setConfirming(false);
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "ส่งอนุมัติไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <ScreenHeader title="ตัวอย่างเอกสาร" backHref={`/create/${documentId}/sign`} />

      <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-white px-4 py-2.5 print:hidden">
        <label className="mr-auto flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={withCertificate}
            onChange={(event) => setWithCertificate(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          <span className="text-[11px] opacity-70">ใบรับรองแทนใบเสร็จรับเงิน</span>
        </label>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn btn-secondary px-3 py-1.5 text-xs"
        >
          พิมพ์ / บันทึก PDF
        </button>
      </div>

      <SheetViewer>
        {detail}
        {withCertificate ? certificate : null}
      </SheetViewer>

      <div className="flex shrink-0 flex-col gap-2.5 border-t-2 border-divider px-4 py-3.5 print:hidden">
        {error ? (
          <div className="border border-accent-500 bg-accent-100 p-2.5 text-xs text-accent-700">
            {error}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={submitting}
          className="btn btn-primary btn-block border border-transparent"
        >
          ส่งอนุมัติ
        </button>
      </div>

      {confirming ? (
        <div className="absolute inset-0 z-25 flex items-end bg-black/45 print:hidden">
          <div className="flex w-full flex-col gap-3.5 border-t-2 border-divider bg-white p-[18px]">
            <h3 className="m-0 text-base">ยืนยันการทำรายการหรือไม่</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn btn-secondary flex-1 justify-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="btn btn-primary flex-1 justify-center border border-transparent"
              >
                {submitting ? "กำลังส่ง…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
