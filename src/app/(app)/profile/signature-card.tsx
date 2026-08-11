"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { ApiRequestError, apiSend } from "@/lib/client/api";

/**
 * Manages the signature kept on the profile.
 *
 * Documents copy the mark at submit time, so replacing or clearing it here never
 * touches a claim that has already been signed — which the card says out loud,
 * because it is the obvious worry.
 */
export function SignatureCard({ current }: { current: string | null }) {
  const router = useRouter();
  const pad = useRef<SignaturePadHandle>(null);

  const [editing, setEditing] = useState(current === null);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const dataUrl = pad.current?.toDataUrl();
    if (!dataUrl) return;

    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/profile/signature", "PUT", { signature: dataUrl });
      setEditing(false);
      setHasInk(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/signature", { method: "DELETE" });
      if (!response.ok) throw new Error("delete failed");
      setEditing(true);
      router.refresh();
    } catch {
      setError("ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-divider p-3">
      <h3 className="mb-1 text-[11px] font-normal opacity-50">ลายเซ็นที่บันทึกไว้</h3>
      <p className="mb-2.5 text-[11px] leading-relaxed opacity-55">
        ใช้เป็นค่าเริ่มต้นตอนลงนาม · เอกสารที่ลงนามไปแล้วจะไม่เปลี่ยนตาม
      </p>

      {!editing && current ? (
        <>
          <div className="border border-divider bg-white p-2">
            <Image
              src={current}
              alt="ลายเซ็นของคุณ"
              width={300}
              height={90}
              unoptimized
              className="max-h-[90px] w-full object-contain"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              className="btn btn-secondary flex-1 justify-center text-xs"
            >
              เซ็นใหม่
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="btn btn-secondary flex-1 justify-center border-accent-500 text-xs text-accent-700"
            >
              ลบลายเซ็น
            </button>
          </div>
        </>
      ) : (
        <>
          <SignaturePad ref={pad} height={130} onChange={setHasInk} />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                pad.current?.clear();
                setHasInk(false);
              }}
              disabled={busy}
              className="btn btn-secondary flex-1 justify-center text-xs"
            >
              ล้าง
            </button>
            {current ? (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setHasInk(false);
                }}
                disabled={busy}
                className="btn btn-secondary flex-1 justify-center text-xs"
              >
                ยกเลิก
              </button>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={!hasInk || busy}
              className="btn btn-primary flex-1 justify-center border border-transparent text-xs"
            >
              {busy ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </>
      )}

      {error ? (
        <div className="mt-2 border border-accent-500 bg-accent-100 p-2.5 text-xs text-accent-700">
          {error}
        </div>
      ) : null}
    </section>
  );
}
