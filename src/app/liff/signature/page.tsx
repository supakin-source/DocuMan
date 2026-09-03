"use client";

import { useEffect, useRef, useState } from "react";

import { closeLiff, liffFetch } from "@/app/liff/liff-provider";
import {
  LiffScreen,
  Notice,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/app/liff/liff-screen";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";

/**
 * Where the signature comes from, now that there is no signing step.
 *
 * Drawn once and kept on the account; every claim submitted from the chat is
 * signed with whatever is stored here at that moment. Redrawing it changes
 * nothing already signed — a document keeps the copy taken when it was
 * submitted.
 */
export default function SignaturePage() {
  return (
    <LiffScreen
      title="ลายเซ็น"
      hint="เซ็นครั้งเดียว ระบบจะนำไปใช้กับเอกสารทุกใบที่คุณส่ง แก้ไขภายหลังได้"
    >
      {({ idToken }) => <SignatureForm idToken={idToken} />}
    </LiffScreen>
  );
}

function SignatureForm({ idToken }: { idToken: string }) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [hasStored, setHasStored] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    liffFetch(idToken, "/api/liff/signature")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return response.json() as Promise<{ hasSignature: boolean }>;
      })
      .then((data) => {
        if (!cancelled) setHasStored(data.hasSignature);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลดข้อมูลไม่สำเร็จ");
      });

    return () => {
      cancelled = true;
    };
  }, [idToken]);

  async function save() {
    const signature = pad.current?.toDataUrl();
    if (!signature) return;

    setSaving(true);
    setError(null);

    try {
      const response = await liffFetch(idToken, "/api/liff/signature", {
        method: "PUT",
        body: JSON.stringify({ signature }),
      });

      if (!response.ok) {
        throw new Error(((await response.json()) as { error?: string }).error);
      }

      setSaved(true);
      // Back to the chat, where the message that sent them here is waiting.
      setTimeout(closeLiff, 900);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return <Notice>บันทึกลายเซ็นแล้ว</Notice>;
  }

  return (
    <div className="flex flex-col gap-3">
      {hasStored ? (
        <p className="text-sm text-neutral-600">
          มีลายเซ็นเดิมอยู่แล้ว เซ็นใหม่ด้านล่างเพื่อแทนที่
        </p>
      ) : null}

      <SignaturePad ref={pad} height={190} onChange={setHasInk} />

      {error ? <Notice>{error}</Notice> : null}

      <button
        type="button"
        className={primaryButtonClass}
        disabled={!hasInk || saving}
        onClick={save}
      >
        {saving ? "กำลังบันทึก…" : "บันทึกลายเซ็น"}
      </button>

      <button
        type="button"
        className={secondaryButtonClass}
        disabled={!hasInk || saving}
        onClick={() => {
          pad.current?.clear();
          setHasInk(false);
        }}
      >
        เซ็นใหม่
      </button>
    </div>
  );
}
