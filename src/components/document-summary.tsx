import { ExpenseStatus } from "@/generated/prisma/enums";
import { StatusBadge } from "@/components/status-badge";
import type { DocumentDetail } from "@/lib/domain/documents";
import { formatThaiDate } from "@/lib/thai";

/**
 * The header block shared by the requester's and the approver's view of a
 * document: status, who raised it, the signing state, and the reason it came
 * back when it did.
 */
export function DocumentSummary({
  document,
  action,
}: {
  document: DocumentDetail;
  /** Slot for a view-specific control, e.g. "ดูเอกสาร". */
  action?: React.ReactNode;
}) {
  const decided = document.status === ExpenseStatus.APPROVED;

  return (
    <>
      <div className="flex items-center justify-between gap-2.5">
        <StatusBadge status={document.status} />
        {action}
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2.5 border border-divider p-3 text-xs">
        <Meta label="ผู้ขอเบิก" value={document.owner.name ?? "—"} />
        <Meta label="ตำแหน่ง" value={document.owner.position ?? "—"} />
        <Meta label="รหัสพนักงาน" value={document.owner.employeeCode ?? "—"} />
        <Meta
          label="วันที่"
          value={formatThaiDate(document.submittedAt ?? document.createdAt)}
        />
      </dl>

      <div className="border border-divider p-3">
        <div className="mb-2 text-[11px] opacity-50">การลงนาม</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="border-t border-divider pt-1.5">
            <div className="text-[10px] opacity-50">ผู้จัดทำ</div>
            <div className="mt-1 text-[10px]">{document.owner.name}</div>
            <div className="text-[9px] opacity-50">
              {document.submittedAt
                ? `ลงนามแล้ว · ${formatThaiDate(document.submittedAt)}`
                : "ยังไม่ได้ลงลายเซ็น"}
            </div>
          </div>
          <div className="border-t border-divider pt-1.5">
            <div className="text-[10px] opacity-50">ผู้ตรวจสอบ/ผู้อนุมัติ</div>
            {decided ? (
              <>
                <div className="mt-1 text-[10px]">{document.decidedBy?.name ?? "—"}</div>
                <div className="text-[9px] opacity-50">
                  อนุมัติแล้ว ·{" "}
                  {document.decidedAt ? formatThaiDate(document.decidedAt) : ""}
                </div>
              </>
            ) : (
              <div className="mt-1 text-[11px] italic opacity-50">
                {document.status === ExpenseStatus.REJECTED
                  ? "ไม่อนุมัติ"
                  : document.status === ExpenseStatus.CORRECTION
                    ? "ส่งกลับให้แก้ไข"
                    : "รอการอนุมัติ"}
              </div>
            )}
          </div>
        </div>
      </div>

      {document.decisionReason ? (
        <div className="border border-accent-400 bg-accent-100 p-3">
          <div className="mb-1 text-[11px] font-extrabold text-accent-700">
            {document.status === ExpenseStatus.REJECTED
              ? "เหตุผลที่ไม่อนุมัติ"
              : "เหตุผลที่ขอให้แก้ไข"}
          </div>
          <div className="text-xs text-accent-700">{document.decisionReason}</div>
        </div>
      ) : null}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] opacity-50">{label}</dt>
      <dd className="m-0 font-bold">{value}</dd>
    </div>
  );
}
