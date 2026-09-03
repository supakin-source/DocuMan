"use client";

import { use, useEffect, useState } from "react";

import { liffFetch } from "@/app/liff/liff-provider";
import { LiffScreen, Notice, Placeholder } from "@/app/liff/liff-screen";
import { ReceiptImage } from "@/app/liff/receipt-image";
import type { ExpenseItemType } from "@/generated/prisma/enums";
import { ITEM_TYPE_LABELS } from "@/lib/domain/items";
import { formatMoney, formatThaiDate } from "@/lib/thai";

/**
 * The claim in full, for the approver deciding on it.
 *
 * Read-only on purpose. The decision itself is three buttons in the chat, where
 * the notification already is — sending someone to a web page to press a button
 * they could have pressed in the message is a step for its own sake. What the
 * page adds is what a Flex bubble cannot hold: every line, and the receipts.
 */

type Item = {
  id: string;
  type: ExpenseItemType;
  incurredOn: string;
  origin: string | null;
  destination: string | null;
  purpose: string | null;
  distanceKm: number | null;
  ratePerKm: number | null;
  amount: number;
  attachmentId: string | null;
};

type Document = {
  docNo: string | null;
  status: string;
  project: string | null;
  description: string | null;
  reason: string | null;
  total: number;
  decisionReason: string | null;
  owner: {
    name: string | null;
    position: string | null;
    department: string | null;
    employeeCode: string | null;
  };
  items: Item[];
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  PENDING: "รออนุมัติ",
  CORRECTION: "ต้องแก้ไข",
  REJECTED: "ไม่อนุมัติ",
  APPROVED: "อนุมัติแล้ว",
};

export default function DocumentPage({ params }: PageProps<"/liff/documents/[id]">) {
  const { id } = use(params);

  return (
    <LiffScreen title="รายละเอียดการเดินทาง">
      {({ idToken }) => <DocumentView idToken={idToken} documentId={id} />}
    </LiffScreen>
  );
}

function DocumentView({ idToken, documentId }: { idToken: string; documentId: string }) {
  const [document, setDocument] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    liffFetch(idToken, `/api/liff/documents/${documentId}`)
      .then(async (response) => {
        const body = (await response.json()) as Document | { error: string };
        if (!response.ok) throw new Error("error" in body ? body.error : "โหลดไม่สำเร็จ");
        return body as Document;
      })
      .then((data) => {
        if (!cancelled) setDocument(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "โหลดไม่สำเร็จ");
      });

    return () => {
      cancelled = true;
    };
  }, [idToken, documentId]);

  if (error) return <Notice>{error}</Notice>;
  if (!document) return <Placeholder>กำลังโหลดเอกสาร…</Placeholder>;

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-md bg-surface px-4 py-3">
        <p className="font-archivo text-sm">{document.docNo ?? "ยังไม่ออกเลขที่"}</p>
        <p className="text-lg font-semibold">{document.owner.name ?? "—"}</p>
        <p className="text-xs text-neutral-600">
          {[document.owner.position, document.owner.department, document.owner.employeeCode]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          สถานะ {STATUS_LABELS[document.status] ?? document.status}
        </p>
      </section>

      {document.decisionReason ? (
        <Notice>เหตุผลที่ส่งกลับ: {document.decisionReason}</Notice>
      ) : null}

      {document.project || document.description || document.reason ? (
        <section className="flex flex-col gap-1 text-sm">
          {document.project ? <Detail label="โครงการ" value={document.project} /> : null}
          {document.description ? (
            <Detail label="รายละเอียด" value={document.description} />
          ) : null}
          {document.reason ? <Detail label="เหตุผลที่ไม่มีใบเสร็จ" value={document.reason} /> : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        {document.items.map((item, index) => (
          <article
            key={item.id}
            className="flex flex-col gap-2 rounded-md border border-divider bg-white px-3 py-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">
                {index + 1}. {ITEM_TYPE_LABELS[item.type]}
              </span>
              <span className="font-archivo text-sm">฿{formatMoney(item.amount)}</span>
            </div>

            <p className="text-xs text-neutral-600">
              {formatThaiDate(new Date(`${item.incurredOn}T00:00:00.000Z`))}
              {item.origin || item.destination
                ? ` · ${item.origin ?? "—"} → ${item.destination ?? "—"}`
                : ""}
            </p>

            {item.distanceKm ? (
              <p className="text-xs text-neutral-600">
                {item.distanceKm} กม. × ฿{formatMoney(item.ratePerKm ?? 0)}
              </p>
            ) : null}

            {item.attachmentId ? (
              <ReceiptImage idToken={idToken} attachmentId={item.attachmentId} />
            ) : (
              <p className="text-xs text-neutral-600">ไม่มีไฟล์แนบ</p>
            )}
          </article>
        ))}
      </section>

      <section className="flex items-baseline justify-between rounded-md bg-surface px-4 py-3">
        <span className="text-sm text-neutral-600">รวมทั้งสิ้น</span>
        <span className="font-archivo text-xl font-semibold text-accent">
          ฿{formatMoney(document.total)}
        </span>
      </section>

      <p className="pb-4 text-center text-xs text-neutral-600">
        กดปุ่มในแชทเพื่ออนุมัติ ส่งกลับแก้ไข หรือไม่อนุมัติ
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-2">
      <span className="w-28 shrink-0 text-xs text-neutral-600">{label}</span>
      <span className="text-sm">{value}</span>
    </p>
  );
}
