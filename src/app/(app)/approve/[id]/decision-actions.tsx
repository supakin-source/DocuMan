"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { ApiRequestError, apiSend } from "@/lib/client/api";
import { DECISION_REASONS } from "@/lib/domain/decisions";
import { formatMoney } from "@/lib/thai";

type Mode = "return" | "reject";

const OTHER = "อื่นๆ";

/**
 * The three verdicts, with the confirmation each one needs: a reason for
 * returning or rejecting, a signature for approving.
 *
 * The server enforces all of this again — this component only decides what the
 * approver is asked for.
 */
export function DecisionActions({
  documentId,
  docNo,
  amount,
  approverName,
}: {
  documentId: string;
  docNo: string;
  amount: number;
  approverName: string;
}) {
  const router = useRouter();
  const pad = useRef<SignaturePadHandle>(null);

  const [comment, setComment] = useState("");
  const [reasonMode, setReasonMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [otherReason, setOtherReason] = useState("");
  const [confirmingReason, setConfirmingReason] = useState(false);
  const [approving, setApproving] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedReason = reason === OTHER ? otherReason.trim() : reason;
  const reasonReady = Boolean(resolvedReason);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/documents/${documentId}/decision`, "POST", {
        comment: comment.trim() || null,
        ...body,
      });
      router.push("/approve");
      router.refresh();
    } catch (cause) {
      setBusy(false);
      setConfirmingReason(false);
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    }
  }

  function closeReasonPanel() {
    setReasonMode(null);
    setReason(null);
    setOtherReason("");
    setConfirmingReason(false);
  }

  return (
    <>
      <div className="field px-4 pb-2">
        <label htmlFor="approver-comment">ความคิดเห็น (ถ้ามี)</label>
        <textarea
          id="approver-comment"
          rows={2}
          className="input"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </div>

      {error ? (
        <div className="mx-4 mb-2 border border-accent-500 bg-accent-100 p-2.5 text-xs text-accent-700">
          {error}
        </div>
      ) : null}

      <div className="flex shrink-0 gap-1.5 border-t-2 border-divider px-4 py-3">
        <button
          type="button"
          onClick={() => setReasonMode("return")}
          disabled={busy}
          className="btn btn-secondary flex-1 justify-center border-accent-500 bg-accent-100 px-1 text-xs text-accent-700"
        >
          ขอแก้ไข
        </button>
        <button
          type="button"
          onClick={() => setReasonMode("reject")}
          disabled={busy}
          className="btn btn-secondary flex-1 justify-center border-text bg-text px-1 text-xs text-white"
        >
          ไม่อนุมัติ
        </button>
        <button
          type="button"
          onClick={() => setApproving(true)}
          disabled={busy}
          className="btn btn-primary flex-1 justify-center border border-transparent px-1 text-xs"
        >
          อนุมัติ
        </button>
      </div>

      {reasonMode ? (
        <div className="absolute inset-0 z-20 flex items-end bg-black/45">
          <div className="no-scrollbar flex max-h-[80%] w-full flex-col gap-3 overflow-y-auto border-t-2 border-divider bg-white p-[18px]">
            <h3 className="m-0 text-base">
              {reasonMode === "return"
                ? "เลือกเหตุผลที่ขอให้แก้ไข"
                : "เลือกเหตุผลที่ไม่อนุมัติ"}
            </h3>

            <div className="flex flex-col gap-1.5">
              {DECISION_REASONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(option)}
                  aria-pressed={reason === option}
                  className={`cursor-pointer border px-3 py-2.5 text-left text-[13px] ${
                    reason === option
                      ? "border-text bg-neutral-200"
                      : "border-divider bg-transparent"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            {reason === OTHER ? (
              <div className="field">
                <label htmlFor="other-reason">*โปรดระบุ</label>
                <input
                  id="other-reason"
                  className="input"
                  value={otherReason}
                  onChange={(event) => setOtherReason(event.target.value)}
                />
              </div>
            ) : null}

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={closeReasonPanel}
                className="btn btn-secondary flex-1 justify-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReason(true)}
                disabled={!reasonReady || busy}
                className="btn btn-primary flex-1 justify-center border border-transparent"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingReason ? (
        <div className="absolute inset-0 z-24 flex items-end bg-black/45">
          <div className="flex w-full flex-col gap-3.5 border-t-2 border-divider bg-white p-[18px]">
            <h3 className="m-0 text-base">ยืนยันการทำรายการหรือไม่</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingReason(false)}
                className="btn btn-secondary flex-1 justify-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() =>
                  send({ decision: reasonMode, reason: resolvedReason })
                }
                disabled={busy}
                className="btn btn-primary flex-1 justify-center border border-transparent"
              >
                {busy ? "กำลังบันทึก…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approving ? (
        <div className="absolute inset-0 z-20 flex items-end bg-black/45">
          <div className="no-scrollbar flex max-h-[88%] w-full flex-col gap-3 overflow-y-auto border-t-2 border-divider bg-white p-[18px]">
            <h3 className="m-0 text-base">ยืนยันการทำรายการหรือไม่</h3>

            <dl className="m-0 flex flex-col gap-1 border border-divider p-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="opacity-50">ผู้อนุมัติ</dt>
                <dd className="m-0 font-bold">{approverName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-50">เอกสาร</dt>
                <dd className="m-0 font-bold">{docNo}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="opacity-50">จำนวนเงิน</dt>
                <dd className="m-0 font-bold">฿{formatMoney(amount)}</dd>
              </div>
            </dl>

            <p className="m-0 text-[11px] leading-relaxed">
              ข้าพเจ้าขอรับรองว่าได้ตรวจสอบเอกสารและหลักฐานประกอบแล้ว และอนุมัติรายการนี้
            </p>

            <SignaturePad ref={pad} height={120} onChange={setHasInk} />
            <button
              type="button"
              onClick={() => pad.current?.clear()}
              className="cursor-pointer self-start border-none bg-transparent text-[11px] underline opacity-55"
            >
              ล้างลายเซ็น
            </button>

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setApproving(false)}
                className="btn btn-secondary flex-1 justify-center"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() =>
                  send({ decision: "approve", signature: pad.current?.toDataUrl() })
                }
                disabled={!hasInk || busy}
                className="btn btn-primary flex-1 justify-center border border-transparent"
              >
                {busy ? "กำลังบันทึก…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
