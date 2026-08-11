"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ScreenHeader } from "@/components/screen-header";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { formatMoney } from "@/lib/thai";

export function SignScreen({
  documentId,
  name,
  email,
  total,
}: {
  documentId: string;
  name: string;
  email: string;
  total: number;
}) {
  const router = useRouter();
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);

  /**
   * The mark is held in sessionStorage rather than posted here: it is only
   * committed when the user confirms on the preview screen, and keeping it out
   * of the URL or a server draft means an abandoned flow leaves no signature
   * behind.
   */
  function next() {
    const dataUrl = pad.current?.toDataUrl();
    if (!dataUrl) return;
    sessionStorage.setItem(`documan:signature:${documentId}`, dataUrl);
    router.push(`/create/${documentId}/preview`);
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="ลงลายเซ็นดิจิทัล" backHref={`/create/${documentId}/review`} />

      <div className="no-scrollbar flex flex-1 flex-col gap-3.5 overflow-y-auto px-4 pt-[18px] pb-6">
        <dl className="m-0 flex flex-col gap-1 border border-divider p-3 text-xs">
          <div className="flex justify-between">
            <dt className="opacity-50">ชื่อ</dt>
            <dd className="m-0 font-bold">{name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-50">อีเมล</dt>
            <dd className="m-0 font-bold">{email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="opacity-50">จำนวนเงิน</dt>
            <dd className="m-0 font-bold">฿{formatMoney(total)}</dd>
          </div>
        </dl>

        <div>
          <div className="mb-2 text-[11px] opacity-55">ลงลายเซ็นด้านล่าง</div>
          <SignaturePad ref={pad} onChange={setHasInk} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => pad.current?.clear()}
              className="btn btn-secondary flex-1 justify-center text-xs"
            >
              ล้างลายเซ็น
            </button>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t-2 border-divider px-4 py-3.5">
        <button
          type="button"
          onClick={next}
          disabled={!hasInk}
          className="btn btn-primary btn-block border border-transparent"
        >
          ยืนยัน
        </button>
      </div>
    </div>
  );
}
